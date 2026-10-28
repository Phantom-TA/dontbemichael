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

function report(over = {}) {
  return {
    kind: 'main-uncaught', detail: 'none', errorName: 'TypeError', frames: ['out/main/index.js:f:1'],
    fingerprint: '0123456789ab', appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    engine: 'claude', engineVersion: 'unknown', count: 2, ...over
  };
}

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
  assert.equal(state.counts['0123456789ab']['0.2.9|darwin'], 2);
  assert.ok(f.calls.some((c) => c.p === `/repos/${REPORTS}/issues/1/comments` && c.body.body === `Promoted to ${MAIN}#500.`));
  // A second run counts nothing twice.
  const again = await run(f, state);
  assert.equal(again.state.counts['0123456789ab']['0.2.9|darwin'], 2);
});

test('forged text, an unknown version or a free text body is rejected, never promoted', async () => {
  const good = report();
  const forged = { ...privIssue(2, good), body: schema.issueBody(good).replace('`TypeError`', '`see https://scam.example`') };
  const unknown = privIssue(3, report({ appVersion: '9.9.9', fingerprint: 'bbbbbbbbbbbb' }));
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
  assert.deepEqual(state.counts['0123456789ab'], { '0.2.9|darwin': 2, '0.2.8|win32': 5 });
});

test('past the daily cap reports wait in the queue, the run fails, and they go next day', async () => {
  const priv = Array.from({ length: 12 }, (_, i) => privIssue(i + 1, report({ fingerprint: i.toString(16).padStart(12, 'a') })));
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
  const missing = await run(fakeGitHub({ priv: [] }), null, T0 + 4 * HOUR);
  assert.deepEqual(missing.failures, ['no canary for 0.2.9']);
  const early = await run(fakeGitHub({ priv: [] }), null, T0);
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
  assert.deepEqual(state.reopened['0123456789ab'], ['0.2.10']);
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
