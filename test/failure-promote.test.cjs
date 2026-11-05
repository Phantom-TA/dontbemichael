'use strict';
// The reports repo's promotion Action and the release canary, with a fake
// GitHub (docs/designs/auto-report-failures.md, Design > Promotion Action).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const schema = loadTs('src/shared/failureReport.ts');
const { runPromotion, newer } = require('../tools/failure-reports/promote.cjs');
const { buildCanary } = require('../tools/failure-reports/canary.cjs');

const REPORTS = 'dontbemichael-reports/failures';
const MAIN = 'agentvivekkumar/dontbemichael';
const HOUR = 3600_000;
const T0 = Date.parse('2026-11-01T12:00:00Z');

/** A report whose fingerprint is the hash of its own fields, as the app makes it. */
function report(over = {}) {
  const r = {
    kind: 'main-uncaught', detail: 'none', errorName: 'TypeError', frames: ['out/main/index.js:f:1'],
    fingerprint: '', appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    engine: 'claude', engineVersion: 'unknown', count: 2, ...over
  };
  if (!over.fingerprint) r.fingerprint = require('node:crypto').createHash('sha256').update(schema.fingerprintInput(r.kind, r.detail, r.errorName, r.frames)).digest('hex').slice(0, 12);
  return r;
}
const FP = report().fingerprint;

/** A tiny GitHub: private issues and comments, main issues, releases. */
function fakeGitHub({ priv = [], privComments = [], mainIssues = [], releases }) {
  const calls = [];
  let nextMain = 500;
  let nextComment = 9000;
  const labels = {};
  const gh = async (token, method, p, body) => {
    calls.push({ token, method, p, body });
    if (method === 'GET' && p.startsWith(`/repos/${MAIN}/releases`)) return { status: 200, json: releases ?? [{ tag_name: 'v0.2.9', published_at: new Date(T0 - 1 * HOUR).toISOString(), draft: false }, { tag_name: 'v0.2.8', published_at: new Date(T0 - 100 * HOUR).toISOString(), draft: false }] };
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues?`)) return { status: 200, json: priv };
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues/comments?`)) return { status: 200, json: privComments };
    let m;
    if (method === 'GET' && (m = p.match(new RegExp(`^/repos/${REPORTS}/issues/(\\d+)$`)))) return { status: 200, json: priv.find((i) => i.number === Number(m[1])) ?? {} };
    if (method === 'POST' && (m = p.match(new RegExp(`^/repos/${REPORTS}/issues/(\\d+)/labels$`)))) { labels[m[1]] = body.labels; return { status: 200, json: {} }; }
    if (method === 'POST' && p.match(new RegExp(`^/repos/${REPORTS}/issues/\\d+/comments$`))) return { status: 201, json: { id: nextComment++ } };
    if (method === 'GET' && p.startsWith('/search/issues')) {
      const fp = decodeURIComponent(p).match(/q=([0-9a-f]{12})/)[1];
      return { status: 200, json: { items: mainIssues.filter((i) => i.title.endsWith(`(${fp})`)) } };
    }
    if (method === 'POST' && p === `/repos/${MAIN}/issues`) { const i = { number: nextMain++, title: body.title, body: body.body, state: 'open' }; mainIssues.push(i); return { status: 201, json: i }; }
    if (method === 'GET' && (m = p.match(new RegExp(`^/repos/${MAIN}/issues/(\\d+)$`)))) return { status: 200, json: mainIssues.find((i) => i.number === Number(m[1])) ?? {} };
    if (method === 'PATCH' && (m = p.match(new RegExp(`^/repos/${MAIN}/issues/(\\d+)$`)))) { const i = mainIssues.find((x) => x.number === Number(m[1])); Object.assign(i, body); return { status: 200, json: i }; }
    if (method === 'POST' && p.match(new RegExp(`^/repos/${MAIN}/issues/\\d+/comments$`))) return { status: 201, json: { id: nextComment++ } };
    if (method === 'PATCH' && p.startsWith(`/repos/${MAIN}/issues/comments/`)) return { status: 200, json: {} };
    return { status: 404, json: {} };
  };
  return { gh, calls, labels, mainIssues };
}

const privIssue = (number, r) => ({ id: 1000 + number, number, title: schema.issueTitle(r), body: schema.issueBody(r) });
const run = (f, state = null, at = T0) => runPromotion({ gh: f.gh, schemaFor: async (v) => (['0.2.9', '0.2.8', '0.2.10'].includes(v) ? schema : null), state, now: () => at, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });

test('a valid report is re-rendered into one main issue with counts, and linked back', async () => {
  // Value: protects=a valid report reaches the main repo once, as fields only (SR2); fails_when=text is copied or dedupe breaks; why_new=new script; seam=none; no_claim=GitHub Actions runtime (run with fakes)
  const r = report();
  const f = fakeGitHub({ priv: [privIssue(1, r)] });
  const { state, failures } = await run(f);
  assert.deepEqual(failures, []);
  const made = f.calls.find((c) => c.method === 'POST' && c.p === `/repos/${MAIN}/issues`);
  assert.equal(made.token, 'm');
  assert.equal(made.body.body, schema.issueBody(r), 're-rendered, not copied');
  assert.deepEqual(made.body.labels, ['auto-report']);
  assert.equal(state.counts[FP]['0.2.9|darwin'], 2);
  assert.ok(f.calls.some((c) => c.p === `/repos/${REPORTS}/issues/1/comments` && c.body.body === `Promoted to ${MAIN}#500.`));
  // A second run counts nothing twice.
  const again = await run(f, state);
  assert.equal(again.state.counts[FP]['0.2.9|darwin'], 2);
});

test('forged text, an unknown version or a free text body is rejected, never promoted', async () => {
  const good = report();
  const forged = { ...privIssue(2, good), body: schema.issueBody(good).replace('`TypeError`', '`see https://scam.example`') };
  const unknown = privIssue(3, report({ appVersion: '9.9.9' }));
  const junk = { id: 2004, number: 4, title: '[auto] x (cccccccccccc)', body: 'Please click https://scam.example' };
  const f = fakeGitHub({ priv: [forged, unknown, junk] });
  await run(f);
  assert.deepEqual(f.labels, { 2: ['rejected'], 3: ['rejected'], 4: ['rejected'] });
  assert.equal(f.mainIssues.length, 0);
});

test('a seen-on comment adds its count to the same main issue', async () => {
  const r = report();
  const f = fakeGitHub({
    priv: [privIssue(1, r)],
    privComments: [{ id: 77, issue_url: `https://api.github.com/repos/${REPORTS}/issues/1`, body: schema.seenOnLine(report({ appVersion: '0.2.8', os: 'win32', osVersion: '10.0.26100', arch: 'x64', count: 5 })) },
      { id: 78, issue_url: `https://api.github.com/repos/${REPORTS}/issues/1`, body: 'seen-on 0.2.9 darwin 15.1.0 arm64 claude unknown count=3 https://scam.example' }]
  });
  const { state } = await run(f);
  assert.equal(f.mainIssues.length, 1);
  assert.deepEqual(state.counts[FP], { '0.2.9|darwin': 2, '0.2.8|win32': 5 });
});

test('past the daily cap reports wait in the queue, the run fails, and they go next day', async () => {
  const priv = Array.from({ length: 12 }, (_, i) => privIssue(i + 1, report({ frames: [`out/main/index.js:f${i}:1`] })));
  const f = fakeGitHub({ priv });
  const first = await run(f);
  assert.equal(f.mainIssues.length, 10);
  assert.equal(first.state.queued.length, 2);
  assert.ok(first.failures.includes('daily cap reached: new issues'));
  const next = await run(f, first.state, T0 + 24 * HOUR);
  assert.equal(f.mainIssues.length, 12);
  assert.equal(next.state.queued.length, 0);
});

test('the canary is checked, never promoted; a missing canary fails the run', async () => {
  const canary = buildCanary(schema, 'v0.2.9');
  const f = fakeGitHub({ priv: [{ id: 5000, number: 50, ...canary }] });
  const ok = await run(f, null, T0 + 4 * HOUR);
  assert.equal(f.mainIssues.length, 0);
  assert.deepEqual(ok.failures, []);
  const missing = await run(fakeGitHub({ priv: [] }), { firstRun: new Date(T0 - 2 * HOUR).toISOString() }, T0 + 4 * HOUR);
  assert.deepEqual(missing.failures, ['no canary for 0.2.9']);
  const before = await run(fakeGitHub({ priv: [] }), null, T0 + 4 * HOUR);
  assert.deepEqual(before.failures, [], 'a release from before the first run is never checked');
  const early = await run(fakeGitHub({ priv: [] }), { firstRun: new Date(T0 - 2 * HOUR).toISOString() }, T0);
  assert.deepEqual(early.failures, [], 'within 3 hours of the release it is not yet missing');
});

test('a closed issue reopens once when a newer version than its fix reports it', async () => {
  const releases = [
    { tag_name: 'v0.2.10', published_at: new Date(T0 - 1 * HOUR).toISOString(), draft: false },
    { tag_name: 'v0.2.9', published_at: new Date(T0 - 50 * HOUR).toISOString(), draft: false }
  ];
  const r = report({ appVersion: '0.2.10' });
  const mainIssues = [{ number: 42, title: schema.issueTitle(report()), state: 'closed', closed_at: new Date(T0 - 40 * HOUR).toISOString() }];
  const f = fakeGitHub({ priv: [privIssue(1, r)], mainIssues, releases });
  const { state } = await run(f);
  assert.equal(mainIssues[0].state, 'open');
  assert.deepEqual(state.reopened[FP], ['0.2.10']);
  mainIssues[0].state = 'closed';
  const f2 = fakeGitHub({ priv: [privIssue(2, r)], mainIssues, releases });
  await run(f2, state);
  assert.equal(mainIssues[0].state, 'closed', 'only once per version');
});

test('versions compare with rc below the release', () => {
  assert.equal(newer('0.2.10', 'v0.2.9'), true);
  assert.equal(newer('0.2.9-rc.1', 'v0.2.9'), false);
  assert.equal(newer('0.2.9', 'v0.2.9-rc.2'), true);
  assert.equal(newer('0.2.9', undefined), true);
});

test('the canary is a valid report that names no machine', () => {
  const c = buildCanary(schema, 'v0.2.9');
  const r = schema.parseIssueBody(c.body);
  assert.equal(r.kind, 'canary');
  assert.equal(r.appVersion, '0.2.9');
  assert.equal(c.title, schema.issueTitle(r));
});

test('a main repo key that does not work fails the run', async () => {
  const f = fakeGitHub({ priv: [] });
  const gh = async (token, method, p, body) => (p.startsWith(`/repos/${MAIN}/releases`) ? { status: 401, json: { message: 'Bad credentials' } } : f.gh(token, method, p, body));
  const out = await runPromotion({ gh, schemaFor: async () => schema, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'bad' });
  assert.deepEqual(out.failures, ['main repo not reachable with MAIN_ISSUES_TOKEN: 401']);
});

test('the promotion workflow stays inside the free Actions minutes', () => {
  // Value: protects=hourly runs of at most 2 minutes (1,440 a month) on Node 24, one at a time (eng OV1); fails_when=the timeout, schedule, runtime or concurrency drift; why_new=promote.yml had no test; seam=none; no_claim=GitHub's real minute accounting
  const yml = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../tools/failure-reports/promote.yml'), 'utf8');
  assert.match(yml, /timeout-minutes: 2\b/);
  assert.match(yml, /cron: '\d+ \* \* \* \*'/, 'hourly');
  assert.match(yml, /node-version: 24\b/, 'Node 24 strips the schema types');
  assert.match(yml, /concurrency:\n\s+group: promote\n\s+cancel-in-progress: false/);
  assert.match(yml, /MAIN_ISSUES_TOKEN: \$\{\{ secrets\.MAIN_ISSUES_TOKEN \}\}/);
  assert.match(yml, /run: node promote\.cjs/);
});

test('a racing duplicate is labelled, the main issue links back, and Seen on is edited once a run', async () => {
  // Value: protects=two offices filing one failure end as one main issue, marked duplicate in private, with one Seen on edit a run (plan Design > Promotion); fails_when=duplicates go unmarked, the back link goes missing or the comment is edited per report; why_new=plan audit items 34-36; seam=none; no_claim=GitHub's real search lag
  const r = report();
  const f = fakeGitHub({ priv: [privIssue(1, r), privIssue(2, r), privIssue(3, r)] });
  const { state } = await run(f);
  assert.deepEqual(f.labels, { 2: ['duplicate'], 3: ['duplicate'] });
  assert.equal(f.mainIssues.length, 1);
  assert.ok(f.calls.some((c) => c.p === `/repos/${MAIN}/issues/500/comments` && c.body.body === `From the automatic reports: ${REPORTS}#1.`));
  const seenWrites = f.calls.filter((c) => (c.method === 'POST' && c.p === `/repos/${MAIN}/issues/500/comments` && /^Seen on/.test(c.body.body)) || (c.method === 'PATCH' && c.p.startsWith(`/repos/${MAIN}/issues/comments/`)));
  assert.equal(seenWrites.length, 1, 'one Seen on write for three reports');
  assert.equal(state.counts[FP]['0.2.9|darwin'], 6);
});

test('end to end: a main process throw becomes one private issue, then one main issue with fields only', async () => {
  // Value: protects=the whole pipeline from a crash to the public issue carries no path, name or text (plan Section 6, 2am Friday); fails_when=any stage passes free text or loses the report; why_new=plan audit item 47; seam=fake GitHub; no_claim=real GitHub and Actions (T9 is the live check)
  const crypto = require('node:crypto');
  const { createFailureReporter } = loadTs('src/main/failureReport.ts');
  const { createFailureSender } = loadTs('src/main/failureSender.ts');
  const files = new Map();
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => T0, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'), engineFor: () => 'claude',
    officeBreakActive: () => false, doNotTrack: () => false, signalName: () => undefined,
    readFile: (p) => files.get(p) ?? null, writeFile: (p, d) => files.set(p, d), warn: () => {}
  });
  const e = new TypeError('cannot read /Users/jane.smith/Harbor & Pine/customers.csv');
  e.stack = `TypeError: cannot read /Users/jane.smith/Harbor & Pine/customers.csv\n    at Hive.routeOnce (/Applications/X.app/Contents/Resources/app.asar/out/main/index.js:3644:11)\n    at /Users/jane.smith/x/node_modules/y.js:1:1`;
  reporter.reportFailure('router-throw', e);
  reporter.flush();
  // The private repo, as the sender sees it.
  const priv = [];
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', reporter, now: () => T0, log: () => {},
    fetch: async (url, init) => {
      if (url.includes('/search/')) return { status: 200, headers: { get: () => null }, json: async () => ({ items: [] }) };
      const b = JSON.parse(init.body);
      const issue = { id: 7000 + priv.length, number: priv.length + 1, title: b.title, body: b.body };
      priv.push(issue);
      return { status: 201, headers: { get: () => null }, json: async () => issue };
    }
  });
  await sender.tick();
  assert.equal(priv.length, 1);
  const f = fakeGitHub({ priv });
  await run(f);
  assert.equal(f.mainIssues.length, 1);
  const pub = `${f.mainIssues[0].title}\n${f.mainIssues[0].body}`;
  assert.doesNotMatch(pub, /jane|smith|Harbor|customers|Users|node_modules|cannot read/);
  assert.match(pub, /out\/main\/index\.js:Hive\.routeOnce:3644/);
  assert.deepEqual(schema.parseIssueBody(f.mainIssues[0].body).kind, 'router-throw');
});

test('a failed release list ends the run before any report is judged', async () => {
  // Value: protects=a main repo outage or bad token never labels every report rejected for good (state machines); fails_when=items are read with an empty release list; why_new=state matrix; seam=fake GitHub; no_claim=none beyond protects
  const f = fakeGitHub({ priv: [privIssue(1, report())] });
  const gh = async (token, method, p, body) => (p.startsWith(`/repos/${MAIN}/releases`) ? { status: 502, json: null } : f.gh(token, method, p, body));
  const out = await runPromotion({ gh, schemaFor: async () => schema, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(out.failures, ['main repo not reachable with MAIN_ISSUES_TOKEN: 502']);
  assert.deepEqual(f.labels, {});
  assert.deepEqual(out.state.counted, {});
  assert.equal(f.calls.length, 0, 'nothing read from the reports repo');
});

test('a schema fetch, report or search that fails for now queues the report; it is never rejected', async () => {
  // Value: protects=a passing GitHub failure costs a run, never a report (state machines); fails_when=a null schema or failed parent read labels rejected, or a failed search files a duplicate; why_new=state matrix; seam=fake GitHub; no_claim=raw.githubusercontent.com outages
  const r = report();
  const f = fakeGitHub({ priv: [privIssue(1, r)] });
  const noSchema = await runPromotion({ gh: f.gh, schemaFor: async () => { throw new Error('schema for 0.2.9: 502'); }, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(f.labels, {});
  assert.equal(noSchema.state.queued.length, 1);
  assert.ok(noSchema.failures.some((x) => x.includes('schema for 0.2.9: 502')));
  const next = await run(f, noSchema.state);
  assert.equal(f.mainIssues.length, 1, 'the queued report goes on the next run');
  assert.equal(next.state.queued.length, 0);

  const g = fakeGitHub({ priv: [privIssue(1, r)] });
  const flaky = async (token, method, p, body) => (method === 'GET' && p === `/repos/${REPORTS}/issues/1` ? { status: 502, json: null } : g.gh(token, method, p, body));
  const parentDown = await runPromotion({ gh: flaky, schemaFor: async () => schema, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(g.labels, {});
  assert.equal(parentDown.state.queued.length, 1);

  const h = fakeGitHub({ priv: [privIssue(1, r)] });
  const searchDown = async (token, method, p, body) => (p.startsWith('/search/') ? { status: 403, json: { message: 'secondary rate limit' } } : h.gh(token, method, p, body));
  const s = await runPromotion({ gh: searchDown, schemaFor: async () => schema, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(h.mainIssues.length, 0, 'no issue filed blind');
  assert.equal(s.state.queued.length, 1);
  assert.ok(s.failures.includes('search main repo: 403'));
});

test('a report whose fingerprint is not the hash of its own fields is rejected', async () => {
  // Value: protects=a made up fingerprint cannot fold junk into a real report's public count (security review); fails_when=promote trusts the stated fingerprint; why_new=security review; seam=fake GitHub; no_claim=none beyond protects
  const forged = report({ fingerprint: 'abcdefabcdef' });
  const f = fakeGitHub({ priv: [privIssue(1, forged)] });
  await run(f);
  assert.deepEqual(f.labels, { 1: ['rejected'] });
  assert.equal(f.mainIssues.length, 0);
});

test('a busy hour is finished by later runs from the cursors, and the Action\'s own comments are skipped', async () => {
  // Value: protects=nothing past the first page is lost and the Action's comments never use report slots (state machines); fails_when=one page a run with lastRun as since, or own comments read as reports; why_new=state matrix; seam=fake GitHub that honours since and per_page; no_claim=GitHub's exact sort tie order
  const priv = Array.from({ length: 70 }, (_, i) => ({ ...privIssue(i + 1, report({ frames: [`out/main/index.js:g${i}:1`] })), updated_at: new Date(T0 - (100 - i) * 60_000).toISOString() }));
  const own = { id: 9001, issue_url: `https://api.github.com/repos/${REPORTS}/issues/1`, body: `Promoted to ${MAIN}#500.`, user: { type: 'Bot' }, updated_at: new Date(T0 - 99 * 60_000).toISOString() };
  const f = fakeGitHub({ priv });
  const gh = async (token, method, p, body) => {
    const page = (list) => {
      const since = /since=([^&]+)/.exec(p)?.[1];
      const per = Number(/per_page=(\d+)/.exec(p)[1]);
      return { status: 200, json: list.filter((x) => !since || x.updated_at >= decodeURIComponent(since)).slice(0, per) };
    };
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues?`)) { assert.match(p, /sort=updated&direction=asc/); return page(priv); }
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues/comments?`)) return page([own]);
    return f.gh(token, method, p, body);
  };
  const go = (state, at) => runPromotion({ gh, schemaFor: async () => schema, state, now: () => at, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  const first = await go(null, T0);
  assert.equal(f.mainIssues.length, 10, 'the daily cap');
  assert.equal(first.state.issueCursor, priv[49].updated_at);
  assert.equal(first.state.counted.c9001, undefined, 'own comment never counted as a report');
  let state = first.state;
  for (let d = 1; d <= 7; d++) state = (await go(state, T0 + d * 24 * HOUR)).state;
  assert.equal(f.mainIssues.length, 70, 'every report reached the main repo');
  assert.equal(state.queued.length, 0);
});

test('a run stops at its time budget, saves where it was, and the queue never grows past 200', async () => {
  // Value: protects=state is always saved inside the 2 minute job, and a flood cannot grow the committed state file without end (red team); fails_when=the run works past its budget or queues without a cap; why_new=red team; seam=fake clock and GitHub; no_claim=GitHub Actions' real timeout handling
  let at = T0;
  const priv = Array.from({ length: 5 }, (_, i) => ({ ...privIssue(i + 1, report({ frames: [`out/main/index.js:h${i}:1`] })), updated_at: new Date(T0 - (10 - i) * 60_000).toISOString() }));
  const f = fakeGitHub({ priv });
  const slow = async (token, method, p, body) => { at += 25_000; return f.gh(token, method, p, body); };
  const out = await runPromotion({ gh: slow, schemaFor: async () => schema, state: null, now: () => at, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.ok(f.mainIssues.length < 5, 'stopped early');
  assert.ok(out.state.issueCursor === null || out.state.issueCursor < priv[4].updated_at, 'unread reports stay behind the cursor');
  assert.equal(out.state.queued.length, 0, 'unread fresh reports are not queued');

  const g = fakeGitHub({ priv: [] });
  const down = async (token, method, p, body) => (/\/issues\/\d+$/.test(p) && p.startsWith(`/repos/${REPORTS}`) ? { status: 502, json: null } : g.gh(token, method, p, body));
  const flood = { queued: Array.from({ length: 260 }, (_, i) => ({ type: 'comment', id: i, number: 1 })) };
  const capped = await runPromotion({ gh: down, schemaFor: async () => schema, state: flood, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(capped.state.queued.length, 200);
  assert.ok(capped.failures.includes('queue full: 60 oldest dropped'));
  assert.ok(capped.state.queued.every((q) => q.body === undefined), 'the queue keeps ids only');
});

test('a queued comment is read again by id, and a throw while handling one report queues only it', async () => {
  // Value: protects=queued comments keep no text in the committed state, and one bad report never loses the run's state (red team); fails_when=the queue needs the body or a throw escapes runPromotion; why_new=red team; seam=fake GitHub; no_claim=none beyond protects
  const r = report();
  const f = fakeGitHub({ priv: [privIssue(1, r)] });
  const line = schema.seenOnLine(report({ appVersion: '0.2.8', os: 'linux', osVersion: '6.1', arch: 'x64', count: 4 }));
  const gh = async (token, method, p, body) => (method === 'GET' && p === `/repos/${REPORTS}/issues/comments/55` ? { status: 200, json: { id: 55, body: line } } : f.gh(token, method, p, body));
  const first = await runPromotion({ gh, schemaFor: async () => schema, state: { queued: [{ type: 'comment', id: 55, number: 1 }] }, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(first.state.counts[FP]['0.2.8|linux'], 4);

  const g = fakeGitHub({ priv: [privIssue(1, r)] });
  const boom = await runPromotion({ gh: g.gh, schemaFor: async () => ({ ...schema, issueTitle: () => { throw new Error('bad schema'); } }), state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(boom.state.queued.length, 1);
  assert.ok(boom.failures.some((x) => x.includes('bad schema')));
});

test('prerelease versions order alpha, beta, rc, release', () => {
  assert.equal(newer('0.2.9-beta.1', 'v0.2.9-alpha.3'), true);
  assert.equal(newer('0.2.9-rc.1', 'v0.2.9-beta.9'), true);
  assert.equal(newer('0.2.9', 'v0.2.9-rc.9'), true);
  assert.equal(newer('0.2.9-beta.2', 'v0.2.9-beta.10'), false);
});

test('a release with no schema rejects for good, and a report that keeps failing is given up after a day', async () => {
  // Value: protects=reports naming a release from before reports (no schema file) cannot jam the queue, and nothing is retried forever (pass 2 review); fails_when=a permanent schema miss queues, or tries never end; why_new=pass 2 red team; seam=fake GitHub; no_claim=raw.githubusercontent's real 404
  const old = report({ appVersion: '0.2.8' });
  const f = fakeGitHub({ priv: [privIssue(1, old)] });
  const out = await runPromotion({ gh: f.gh, schemaFor: async (v) => (v === '0.2.8' ? null : schema), state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(f.labels, { 1: ['rejected'] });
  assert.equal(out.state.queued.length, 0);
  const partial = { ...schema, fingerprintInput: undefined };
  const g = fakeGitHub({ priv: [privIssue(1, report())] });
  await runPromotion({ gh: g.gh, schemaFor: async () => partial, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(g.labels, { 1: ['rejected'] }, 'an old schema without the needed functions rejects');

  const h = fakeGitHub({ priv: [privIssue(1, report())] });
  const down = async (token, method, p, body) => (method === 'GET' && p === `/repos/${REPORTS}/issues/1` ? { status: 502, json: null } : h.gh(token, method, p, body));
  let state = null;
  let failures = [];
  for (let i = 0; i < 24; i++) ({ state, failures } = await runPromotion({ gh: down, schemaFor: async () => schema, state, now: () => T0 + i * HOUR, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' }));
  assert.equal(state.queued.length, 0);
  assert.ok(failures.some((x) => x.startsWith('gave up on issue 1001')));
});

test('queued reports that keep failing never starve new reports or the canary', async () => {
  // Value: protects=new reports and the canary are reached while a backlog fails, and failures go to the back (pass 2 review); fails_when=queued items take every slot or keep the front; why_new=pass 2 red team; seam=fake GitHub; no_claim=GitHub's real search limits
  const canary = { id: 5000, number: 50, ...buildCanary(schema, 'v0.2.9'), updated_at: new Date(T0 - 5 * 60_000).toISOString() };
  const f = fakeGitHub({ priv: [canary] });
  const down = async (token, method, p, body) => (/^\/repos\/[^/]+\/[^/]+\/issues\/([1-9]|[1-9]\d)$/.test(p) && p.startsWith(`/repos/${REPORTS}`) && !p.endsWith('/50') ? { status: 502, json: null } : f.gh(token, method, p, body));
  const backlog = { queued: Array.from({ length: 60 }, (_, i) => ({ type: 'issue', id: 9000 + i, number: i + 1 })) };
  const out = await runPromotion({ gh: down, schemaFor: async () => schema, state: backlog, now: () => T0 + 4 * HOUR, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.ok(out.state.canary['0.2.9'], 'the canary was read');
  assert.ok(!out.failures.includes('no canary for 0.2.9'));
  assert.equal(out.state.queued.length, 60);
  assert.equal(out.state.queued[0].id, 9025, 'the 35 not reached wait at the front, the 25 that failed go to the back');
  assert.equal(out.state.queued[59].tries, 1);
});

test('already counted reports touched again by comments use no slot, and tied times read the next page', async () => {
  // Value: protects=comments on counted issues (which move their updated_at) cannot use up a run, and 50+ items in one second never stall a cursor (pass 2 review); fails_when=counted items take slots or the same page is asked for forever; why_new=pass 2 reviews; seam=fake GitHub that pages; no_claim=GitHub's exact tie order
  const tie = new Date(T0 - 30 * 60_000).toISOString();
  const r = report();
  const priv = Array.from({ length: 60 }, (_, i) => ({ ...privIssue(i + 1, r), updated_at: tie }));
  const comment = { id: 77, issue_url: `https://api.github.com/repos/${REPORTS}/issues/1`, body: schema.seenOnLine(report({ appVersion: '0.2.8', os: 'win32', osVersion: '10.0.26100', arch: 'x64', count: 5 })), updated_at: new Date(T0 - 10 * 60_000).toISOString() };
  const f = fakeGitHub({ priv });
  const pages = [];
  const gh = async (token, method, p, body) => {
    const list = (all) => {
      const per = Number(/per_page=(\d+)/.exec(p)[1]);
      const page = Number(/page=(\d+)/.exec(p.replace(/per_page=\d+/, ''))?.[1] ?? 1);
      const since = /since=([^&]+)/.exec(p)?.[1];
      const kept = all.filter((x) => !since || x.updated_at >= decodeURIComponent(since));
      return { status: 200, json: kept.slice((page - 1) * per, page * per) };
    };
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues?`)) { pages.push(p); return list(priv); }
    if (method === 'GET' && p.startsWith(`/repos/${REPORTS}/issues/comments?`)) return list([comment]);
    return f.gh(token, method, p, body);
  };
  const go = (state, at) => runPromotion({ gh, schemaFor: async () => schema, state, now: () => at, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  const first = await go(null, T0);
  const second = await go(first.state, T0 + HOUR);
  assert.ok(pages.some((p) => /&page=2$/.test(p)), 'a full page on the cursor second reads page 2');
  assert.equal(Object.keys(second.state.counted).filter((k) => k.startsWith('i')).length, 60, 'all 60 tied issues counted');
  assert.equal(second.state.counts[FP]['0.2.8|win32'], 5, 'the comment behind 60 counted issues was reached');
  assert.equal(f.mainIssues.length, 1);
});

test('state is saved after every report, so a run cut short never files twice', async () => {
  // Value: protects=a run killed at the job timeout keeps the main issues it filed (pass 2 review); fails_when=state is written only at the end; why_new=pass 2 red team; seam=save callback; no_claim=SIGKILL timing on Actions
  const priv = Array.from({ length: 3 }, (_, i) => privIssue(i + 1, report({ frames: [`out/main/index.js:s${i}:1`] })));
  const f = fakeGitHub({ priv });
  const saves = [];
  await runPromotion({ gh: f.gh, schemaFor: async () => schema, state: null, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm', save: (s) => saves.push(JSON.parse(JSON.stringify(s))) });
  const firstFiled = saves.find((s) => Object.keys(s.mainIssue).length === 1);
  assert.ok(firstFiled, 'saved right after the first main issue');
  assert.ok(saves.length >= 4);
});

test('only a state saved before the cursors starts them at its last run', async () => {
  // Value: protects=the one time move from lastRun to cursors never skips comments later (pass 2 tie test found it); fails_when=a null cursor is reset to lastRun on every run; why_new=bug found while testing cycle 2; seam=fake GitHub; no_claim=none beyond protects
  const seen = [];
  const f = fakeGitHub({ priv: [] });
  const gh = async (token, method, p, body) => { if (method === 'GET' && p.includes('/issues/comments?')) seen.push(p); return f.gh(token, method, p, body); };
  const go = (state) => runPromotion({ gh, schemaFor: async () => schema, state, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  await go({ lastRun: '2026-10-31T00:00:00.000Z' });
  assert.match(seen[0], /since=2026-10-31/);
  await go({ lastRun: '2026-10-31T00:00:00.000Z', issueCursor: null, commentCursor: null });
  assert.doesNotMatch(seen[1], /since=/);
});

test('an older comment is reached before 50 newer issues: both lists run in one time order', async () => {
  // Value: protects=a seen-on comment is never starved by a busy issue list (pass 2 fix; pass 3 found it untested); fails_when=issues are handled before older comments; why_new=pass 3 mutation testing; seam=fake GitHub; no_claim=GitHub's exact sort
  const priv = Array.from({ length: 60 }, (_, i) => ({ ...privIssue(i + 1, report({ frames: [`out/main/index.js:t${i}:1`] })), updated_at: new Date(T0 - (50 - i % 50) * 60_000).toISOString() }));
  const comment = { id: 77, issue_url: `https://api.github.com/repos/${REPORTS}/issues/1`, body: schema.seenOnLine(report({ appVersion: '0.2.8', os: 'win32', osVersion: '10.0.26100', arch: 'x64', count: 5 })), updated_at: new Date(T0 - 90 * 60_000).toISOString() };
  const f = fakeGitHub({ priv, privComments: [comment] });
  const { state } = await run(f);
  assert.equal(state.counted.c77, 1, 'the older comment was handled in the first run');
});

test('past the daily cap a new fingerprint waits without a main repo search', async () => {
  // Value: protects=a capped run spends no search quota (pass 2 fix; pass 3 found it untested); fails_when=the search runs before the cap check; why_new=pass 3 mutation testing; seam=fake GitHub; no_claim=GitHub's search limits
  const f = fakeGitHub({ priv: [privIssue(1, report())] });
  const day = new Date(T0).toISOString().slice(0, 10);
  const out = await run(f, { day, newIssues: 10 });
  assert.equal(f.calls.filter((c) => c.p.startsWith('/search/')).length, 0);
  assert.equal(out.state.queued.length, 1);
  assert.equal(out.state.queued[0].tries, 0, 'a cap wait is not a failed try');
  assert.ok(out.failures.includes('daily cap reached: new issues'));
});

test('a Seen on edit left from a run is made on the next one, and one that fails stays for later', async () => {
  // Value: protects=counts reach the public Seen on comment even when a run ran out of time or GitHub failed (pass 2 fix and pass 3 note); fails_when=seenDirty is not carried, a failed edit is dropped, or a deleted comment is PATCHed forever; why_new=pass 3 mutation testing and review note; seam=fake GitHub; no_claim=none beyond protects
  const carried = { seenDirty: [FP], seenComment: { [FP]: 123 }, mainIssue: { [FP]: 500 }, counts: { [FP]: { '0.2.9|darwin': 4 } } };
  const f = fakeGitHub({ priv: [] });
  const ok = await run(f, carried);
  assert.ok(f.calls.some((c) => c.method === 'PATCH' && c.p === `/repos/${MAIN}/issues/comments/123`));
  assert.deepEqual(ok.state.seenDirty, []);

  const g = fakeGitHub({ priv: [] });
  const down = async (token, method, p, body) => (method === 'PATCH' && p.includes('/issues/comments/') ? { status: 502, json: null } : g.gh(token, method, p, body));
  const failed = await runPromotion({ gh: down, schemaFor: async () => schema, state: carried, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(failed.state.seenDirty, [FP], 'kept for the next run');
  assert.ok(failed.failures.includes(`seen on ${FP}: 502`));

  const h = fakeGitHub({ priv: [] });
  const gone = async (token, method, p, body) => (method === 'PATCH' && p.includes('/issues/comments/') ? { status: 404, json: null } : h.gh(token, method, p, body));
  const deleted = await runPromotion({ gh: gone, schemaFor: async () => schema, state: carried, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(deleted.state.seenComment[FP], undefined, 'a deleted comment is forgotten');
  const again = await run(h, deleted.state);
  assert.ok(h.calls.some((c) => c.method === 'POST' && c.p === `/repos/${MAIN}/issues/500/comments` && /^Seen on/.test(c.body.body)), 'and posted anew');
  assert.deepEqual(again.state.seenDirty, []);
});

test('Seen on edits stop past their own budget and wait for the next run', async () => {
  // Value: protects=the run saves state inside the job timeout even with many Seen on edits (pass 2 fix; pass 3 found it untested); fails_when=the Seen on loop ignores the clock; why_new=pass 3 mutation testing; seam=fake clock; no_claim=GitHub Actions' real timeout
  let calls = 0;
  const now = () => (calls++ === 0 ? T0 : T0 + 100_000);
  const carried = { seenDirty: [FP], seenComment: { [FP]: 123 }, mainIssue: { [FP]: 500 }, counts: { [FP]: { '0.2.9|darwin': 4 } } };
  const f = fakeGitHub({ priv: [] });
  const out = await runPromotion({ gh: f.gh, schemaFor: async () => schema, state: carried, now, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.equal(f.calls.filter((c) => c.method === 'PATCH').length, 0);
  assert.deepEqual(out.state.seenDirty, [FP]);
});

test('a save in the middle of a run still holds the queued reports not yet reached', async () => {
  // Value: protects=a run killed after its first save loses no queued report (pass 2 fix; pass 3 found it untested); fails_when=the snapshot's queue leaves out unreached items; why_new=pass 3 mutation testing; seam=save callback; no_claim=SIGKILL timing
  const priv = Array.from({ length: 3 }, (_, i) => privIssue(i + 1, report({ frames: [`out/main/index.js:q${i}:1`] })));
  const f = fakeGitHub({ priv });
  const saves = [];
  const queued = priv.map((p) => ({ type: 'issue', id: p.id, number: p.number }));
  await runPromotion({ gh: f.gh, schemaFor: async () => schema, state: { queued }, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm', save: (s) => saves.push(JSON.parse(JSON.stringify(s))) });
  const firstAfterItem = saves.find((s) => s.counted[`i${priv[0].id}`]);
  const ids = firstAfterItem.queued.map((q) => q.id);
  assert.ok(ids.includes(priv[1].id) && ids.includes(priv[2].id), 'the two not yet reached are in the saved queue');
});

test('a deleted main issue is forgotten instead of failing every run', async () => {
  // Value: protects=a main issue the owner deleted never turns every run red; the next report files a new one; fails_when=a 404 on the Seen on post keeps the fingerprint dirty for good; why_new=found reviewing the Seen on retry; seam=fake GitHub; no_claim=none beyond protects
  const carried = { seenDirty: [FP], mainIssue: { [FP]: 500 }, counts: { [FP]: { '0.2.9|darwin': 4 } } };
  const f = fakeGitHub({ priv: [] });
  const gone = async (token, method, p, body) => (method === 'POST' && p === `/repos/${MAIN}/issues/500/comments` ? { status: 404, json: null } : f.gh(token, method, p, body));
  const out = await runPromotion({ gh: gone, schemaFor: async () => schema, state: carried, now: () => T0, reportsRepo: REPORTS, reportsToken: 'r', mainToken: 'm' });
  assert.deepEqual(out.state.seenDirty, []);
  assert.equal(out.state.mainIssue[FP], undefined);
});
