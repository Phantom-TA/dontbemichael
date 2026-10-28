'use strict';
// Automatic failure reports: filing into the private reports repo with a fake
// GitHub and clock (docs/designs/auto-report-failures.md, Design > Filing).
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const loadTs = require('./load-ts.cjs');
const { createFailureReporter } = loadTs('src/main/failureReport.ts');
const { createFailureSender, classifyResponse, WRITES_PER_HOUR, SEARCHES_PER_HOUR, WAIT_DEFAULT_MS } = loadTs('src/main/failureSender.ts');
const { REPORTS_REPO, parseIssueBody, issueBody } = loadTs('src/shared/failureReport.ts');

const hdrs = (h = {}) => ({ get: (n) => (n in h ? h[n] : null) });

function setup({ responses = [], key = 'k', failures = 1 } = {}) {
  let now = 1_700_000_000_000;
  const files = new Map();
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => now, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'), engineFor: () => 'claude',
    officeBreakActive: () => false, doNotTrack: () => false, signalName: () => undefined,
    readFile: (p) => files.get(p) ?? null, writeFile: (p, d) => files.set(p, d), warn: () => {}
  });
  for (let i = 0; i < failures; i++) {
    const e = new Error('x');
    e.stack = `Error\n    at f${i} (/x/app.asar/out/main/index.js:${i + 1}:1)`;
    reporter.reportFailure('router-throw', e);
  }
  const calls = [];
  const logs = [];
  const queue = [...responses];
  const sender = createFailureSender({
    key, appVersion: '0.2.9', reporter, now: () => now, log: (e) => logs.push(e),
    fetch: async (url, init) => {
      calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization });
      const next = queue.shift();
      if (!next) throw new Error('offline');
      if (next === 'offline') throw new Error('offline');
      return { status: next.status, headers: hdrs(next.headers), json: async () => next.json ?? {} };
    }
  });
  return { reporter, sender, calls, logs, tick: (ms) => { now += ms; } };
}

test('statuses map to stop, wait, drop, retry or gone', () => {
  assert.equal(classifyResponse(201, hdrs()), 'ok');
  assert.equal(classifyResponse(401, hdrs()), 'stop');
  assert.equal(classifyResponse(403, hdrs()), 'stop');
  assert.equal(classifyResponse(403, hdrs({ 'retry-after': '60' })), 'wait');
  assert.equal(classifyResponse(403, hdrs({ 'x-ratelimit-remaining': '0' })), 'wait');
  assert.equal(classifyResponse(429, hdrs()), 'wait');
  assert.equal(classifyResponse(422, hdrs()), 'drop');
  assert.equal(classifyResponse(400, hdrs()), 'drop');
  assert.equal(classifyResponse(502, hdrs()), 'retry');
  assert.equal(classifyResponse(404, hdrs()), 'gone');
});

test('a new fingerprint is searched, then created in the reports repo with closed fields', async () => {
  // Value: protects=a failure reaches the private repo once, as fields only; fails_when=the target, title or body drift; why_new=new sender; seam=injected fetch; no_claim=GitHub's real responses (fake fetch; T9 is the live check)
  const { sender, calls, reporter } = setup({ responses: [{ status: 200, json: { items: [] } }, { status: 201, json: { number: 7 } }] });
  await sender.tick();
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /^https:\/\/api\.github\.com\/search\/issues\?q=/);
  assert.ok(decodeURIComponent(calls[0].url).includes(`repo:${REPORTS_REPO}`));
  assert.equal(calls[1].url, `https://api.github.com/repos/${REPORTS_REPO}/issues`);
  assert.equal(calls[1].auth, 'Bearer k');
  assert.deepEqual(calls[1].body.labels, ['auto']);
  assert.ok(parseIssueBody(calls[1].body.body), 'the body reads back as a report');
  assert.deepEqual(reporter.pending(), []);
  assert.equal(reporter.issueFor(calls[1].body.title.match(/\(([0-9a-f]{12})\)$/)[1]), 7);
});

test('a search hit gets one seen-on comment, and a later version comments on the known number', async () => {
  const fp = setup().reporter.pending()[0].fingerprint;
  const real = setup().reporter.pending()[0];
  const s = setup({ responses: [{ status: 200, json: { items: [{ number: 3, title: `[auto] router-throw Error (${fp})`, body: issueBody(real) }] } }, { status: 201 }] });
  await s.sender.tick();
  assert.equal(s.calls[1].url, `https://api.github.com/repos/${REPORTS_REPO}/issues/3/comments`);
  assert.match(s.calls[1].body.body, /^seen-on 0\.2\.9 darwin 15\.1\.0 arm64 claude unknown count=1$/);
  assert.equal(s.reporter.issueFor(fp), 3);
});

test('no key never calls GitHub', async () => {
  const { sender, calls } = setup({ key: '', responses: [{ status: 201 }] });
  await sender.tick();
  assert.equal(calls.length, 0);
});

test('a revoked key stops sending for the version and says so once', async () => {
  const { sender, calls, logs, reporter } = setup({ responses: [{ status: 401 }], failures: 2 });
  await sender.tick();
  await sender.tick();
  assert.equal(calls.length, 1);
  assert.deepEqual(logs, [{ kind: 'failure-report-stopped', status: 401, version: '0.2.9' }]);
  assert.equal(reporter.pending().length, 2, 'rows are kept for the next release');
});

test('a rate limit waits for retry-after, then resumes', async () => {
  const { sender, calls, tick } = setup({ responses: [{ status: 403, headers: { 'retry-after': '120' } }, { status: 200, json: { items: [] } }, { status: 201, json: { number: 9 } }] });
  await sender.tick();
  await sender.tick();
  assert.equal(calls.length, 1);
  tick(121_000);
  await sender.tick();
  assert.equal(calls.length, 3);
});

test('a 422 drops only that row; the others go on', async () => {
  // Value: protects=one malformed row never stops all sending (eng E-R4); fails_when=400/422 maps to stop; why_new=new sender; seam=injected fetch; no_claim=GitHub's 422 bodies
  const { sender, logs, reporter } = setup({ failures: 2, responses: [{ status: 200, json: { items: [] } }, { status: 422 }, { status: 200, json: { items: [] } }, { status: 201, json: { number: 5 } }] });
  await sender.tick();
  assert.equal(logs[0].kind, 'failure-report-dropped');
  assert.deepEqual(reporter.pending(), []);
});

test('a deleted known issue is forgotten and searched again, never a stop', async () => {
  // Value: protects=one deleted issue never stops all sending (eng OV10); fails_when=a 404 on a comment maps to stop; why_new=new sender; seam=injected fetch; no_claim=none beyond protects
  const row = setup().reporter.pending()[0];
  const forgotten = [];
  const logs = [];
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', now: () => 0, log: (e) => logs.push(e),
    reporter: { pending: () => [row], issueFor: () => 4, markSent: () => assert.fail('not sent'), forgetIssue: (fp) => forgotten.push(fp), markDropped: () => assert.fail('not dropped'), flush: () => {} },
    fetch: async () => ({ status: 404, headers: hdrs(), json: async () => ({}) })
  });
  await sender.tick();
  assert.deepEqual(forgotten, [row.fingerprint]);
  assert.deepEqual(logs, []);
  assert.equal(sender.state().stopped, false);
});

test('per install caps hold writes and searches back', async () => {
  const n = WRITES_PER_HOUR + 3;
  const responses = [];
  for (let i = 0; i < n; i++) responses.push({ status: 200, json: { items: [] } }, { status: 201, json: { number: i + 1 } });
  const { sender, calls, reporter } = setup({ failures: n, responses });
  await sender.tick();
  const searches = calls.filter((c) => c.method === 'GET').length;
  const writes = calls.filter((c) => c.method === 'POST').length;
  assert.ok(searches <= SEARCHES_PER_HOUR && writes <= WRITES_PER_HOUR, `${searches} searches, ${writes} writes`);
  assert.ok(reporter.pending().length >= 3, 'the rest wait');
});

test('offline leaves every row pending', async () => {
  const { sender, reporter } = setup({ responses: ['offline'] });
  await sender.tick();
  assert.equal(reporter.pending().length, 1);
});

test('a decoy issue with the fingerprint in its title but junk in its body is not used', async () => {
  const fp = setup().reporter.pending()[0].fingerprint;
  const s = setup({ responses: [{ status: 200, json: { items: [{ number: 99, title: `[auto] x (${fp})`, body: 'visit https://scam.example' }] } }, { status: 201, json: { number: 100 } }] });
  await s.sender.tick();
  assert.equal(s.calls[1].url, `https://api.github.com/repos/${REPORTS_REPO}/issues`, 'creates its own issue');
  assert.equal(s.reporter.issueFor(fp), 100);
});

test('a server error backs off 10 minutes, doubling to at most an hour, and a success resets it', async () => {
  // Value: protects=a GitHub outage never makes every install hammer the API (eng E-R4); fails_when=a 5xx stops setting a wait, stops doubling, loses the one hour cap, or never resets after a success; why_new=only classifyResponse(502) was tested, not the backoff; seam=injected fetch and clock; no_claim=GitHub's real outage statuses
  const row = setup().reporter.pending()[0];
  let now = 1_700_000_000_000;
  const statuses = [];
  const sent = [];
  let calls = 0;
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', now: () => now, log: () => {},
    reporter: { pending: () => [row], issueFor: () => 4, markSent: (_r, n) => sent.push(n), forgetIssue: () => {}, markDropped: () => assert.fail('not dropped'), flush: () => {} },
    fetch: async () => { calls++; return { status: statuses.shift(), headers: hdrs(), json: async () => ({}) }; }
  });
  const MIN = 60_000;
  const waits = [];
  for (let i = 0; i < 5; i++) {
    statuses.push(502);
    await sender.tick();
    waits.push((sender.state().waitUntil - now) / MIN);
    await sender.tick(); // still waiting
    assert.equal(calls, i + 1, 'no call while waiting');
    now = sender.state().waitUntil;
  }
  assert.deepEqual(waits, [10, 20, 40, 60, 60]);
  statuses.push(201);
  await sender.tick();
  assert.deepEqual(sent, [4]);
  statuses.push(503);
  await sender.tick();
  assert.equal((sender.state().waitUntil - now) / MIN, 10, 'a success starts the backoff over');
  assert.equal(sender.state().stopped, false, 'a server error never stops sending');
});

test('a rate limit without retry-after waits the default hour', async () => {
  // Value: protects=a 429 with no header still pauses sending; fails_when=a missing retry-after becomes a zero or NaN wait; why_new=only the retry-after case was tested; seam=injected fetch and clock; no_claim=GitHub's real headers
  const { sender } = setup({ responses: [{ status: 429 }] });
  await sender.tick();
  assert.equal(sender.state().waitUntil - 1_700_000_000_000, WAIT_DEFAULT_MS);
});

test('a 404 when filing a new issue stops sending: the reports repo is gone or the key cannot reach it', async () => {
  // Value: protects=a missing repo or a key without access stops all sending for the version (eng OV10) instead of retrying every row; fails_when=a 404 outside a comment is read as a deleted issue or a dropped row; why_new=only a 404 on a comment was tested; seam=injected fetch; no_claim=GitHub's real 404 bodies
  const { sender, calls, logs, reporter } = setup({ failures: 2, responses: [{ status: 200, json: { items: [] } }, { status: 404 }] });
  await sender.tick();
  await sender.tick();
  assert.equal(calls.length, 2, 'nothing more after the 404');
  assert.equal(sender.state().stopped, true);
  assert.deepEqual(logs, [{ kind: 'failure-report-stopped', status: 404, version: '0.2.9' }]);
  assert.equal(reporter.pending().length, 2, 'both rows stay owed for the next release');
});


test('DO_NOT_TRACK set after a failure was kept still sends nothing', async () => {
  // Value: protects=TELEMETRY.md's promise that DO_NOT_TRACK sends nothing (SR4, D15 A); fails_when=rows queued before DO_NOT_TRACK was set are still filed; why_new=only new rows under DO_NOT_TRACK were tested; seam=injected deps; no_claim=the real environment variable
  let dnt = false;
  const files = new Map();
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => 1_700_000_000_000, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'), engineFor: () => 'claude',
    officeBreakActive: () => false, doNotTrack: () => dnt, signalName: () => undefined,
    readFile: (p) => files.get(p) ?? null, writeFile: (p, d) => files.set(p, d), warn: () => {}
  });
  reporter.reportFailure('router-throw', new Error('x'));
  dnt = true;
  reporter.reportFailure('router-throw', new Error('x'));
  const calls = [];
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', reporter, now: () => 1_700_000_000_000, log: () => {},
    fetch: async (url) => { calls.push(url); return { status: 200, headers: hdrs(), json: async () => ({ items: [] }) }; }
  });
  await sender.tick();
  assert.deepEqual(calls, []);
});

test('an install writes at most 20 times a day, then waits for the day to pass', async () => {
  // Value: protects=one broken install can never flood the reports repo (eng E-R4, 20 writes a day); fails_when=the daily cap is dropped or counts a shorter window; why_new=only the hourly caps were tested; seam=injected fetch and clock; no_claim=GitHub's own limits
  const { reporter } = setup({ failures: 30 });
  let now = 1_700_000_000_000;
  let number = 0;
  const calls = [];
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', reporter, now: () => now, log: () => {},
    fetch: async (url, init) => {
      calls.push(init.method);
      return init.method === 'GET'
        ? { status: 200, headers: hdrs(), json: async () => ({ items: [] }) }
        : { status: 201, headers: hdrs(), json: async () => ({ number: ++number }) };
    }
  });
  const HOUR = 3600_000;
  for (let h = 0; h < 6; h++) { await sender.tick(); now += HOUR + 1; }
  assert.equal(calls.filter((m) => m === 'POST').length, 20, 'five an hour, twenty a day');
  assert.equal(reporter.pending().length, 10);
  now = 1_700_000_000_000 + 24 * HOUR + 1;
  await sender.tick();
  assert.equal(calls.filter((m) => m === 'POST').length, 25, 'the next day it goes on');
});

test('a flush while a GitHub call is in flight never loses the send or the count', async () => {
  // Value: protects=the ledger invariant across the sender's await: one row, ends sent, count folded (plan Section 4 async ordering); fails_when=the sender marks a stale copy or a flush overwrites the send; why_new=plan audit item 45; seam=injected fetch; no_claim=real file timing
  let now = 1_700_000_000_000;
  const files = new Map();
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => now, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'), engineFor: () => 'claude',
    officeBreakActive: () => false, doNotTrack: () => false, signalName: () => undefined,
    readFile: (p) => files.get(p) ?? null, writeFile: (p, d) => files.set(p, d), warn: () => {}
  });
  const err = () => { const e = new Error('x'); e.stack = 'Error\n    at f (/x/app.asar/out/main/index.js:1:1)'; return e; };
  reporter.reportFailure('router-throw', err());
  let release;
  const gate = new Promise((r) => { release = r; });
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', reporter, now: () => now, log: () => {},
    fetch: async (url) => {
      if (url.includes('/search/')) { await gate; return { status: 200, headers: hdrs(), json: async () => ({ items: [] }) }; }
      return { status: 201, headers: hdrs(), json: async () => ({ number: 12 }) };
    }
  });
  const ticking = sender.tick();
  // Paused inside the search: the same failure happens again and a flush runs.
  await new Promise((r) => setImmediate(r));
  reporter.reportFailure('router-throw', err());
  reporter.flush();
  release();
  await ticking;
  const rows = files.get('/ud/failures.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'sent');
  assert.equal(rows[0].issue, 12);
  assert.equal(rows[0].count, 2);
});

test('a full disk, no network and a rate limit in one run leave the app working and the ledger whole', async () => {
  // Value: protects=the reporter and sender survive their worst day together (plan Section 6 chaos); fails_when=any of the three throws out or loses rows; why_new=plan audit item 47; seam=injected fs and fetch; no_claim=real ENOSPC or a real outage
  let now = 1_700_000_000_000;
  let diskFull = true;
  const files = new Map();
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => now, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'), engineFor: () => 'claude',
    officeBreakActive: () => false, doNotTrack: () => false, signalName: () => undefined,
    readFile: (p) => files.get(p) ?? null,
    writeFile: (p, d) => { if (diskFull) { const e = new Error('full'); e.code = 'ENOSPC'; throw e; } files.set(p, d); },
    warn: () => {}
  });
  for (let i = 0; i < 3; i++) { const e = new Error('x'); e.stack = `Error\n    at f${i} (/x/app.asar/out/main/index.js:${i + 1}:1)`; reporter.reportFailure('router-throw', e); }
  assert.doesNotThrow(() => reporter.flush());
  const answers = ['offline', { status: 403, headers: { 'retry-after': '60' } }];
  const sender = createFailureSender({
    key: 'k', appVersion: '0.2.9', reporter, now: () => now, log: () => {},
    fetch: async () => { const a = answers.shift(); if (!a || a === 'offline') throw new Error('offline'); return { status: a.status, headers: hdrs(a.headers), json: async () => ({}) }; }
  });
  await sender.tick();
  await sender.tick();
  assert.equal(sender.state().stopped, false);
  assert.equal(reporter.pending().length, 3, 'nothing lost while the disk is full and the network is down');
  diskFull = false;
  now += 61_000;
  reporter.flush();
  assert.equal(files.get('/ud/failures.jsonl').split('\n').filter(Boolean).length, 3, 'the ledger is written once the disk has room');
});

test('a deleted issue answering 410 is forgotten like a 404, with no stop and no back off', async () => {
  // Value: protects=the owner deleting a spam issue never blocks every later report from an install (red team); fails_when=410 maps to retry and the oldest row holds the queue; why_new=GitHub answers 410 for a deleted issue; seam=injected fetch; no_claim=GitHub's exact deleted issue status on every endpoint
  assert.equal(classifyResponse(410, hdrs()), 'gone');
  const forgotten = [];
  const row = { ...setup().reporter.pending()[0] };
  const s2 = createFailureSender({
    key: 'k', appVersion: '0.2.9', now: () => 0, log: () => {},
    reporter: { pending: () => [row], issueFor: () => 4, markSent: () => assert.fail('not sent'), forgetIssue: (fp) => forgotten.push(fp), markDropped: () => assert.fail('not dropped'), flush: () => {} },
    fetch: async () => ({ status: 410, headers: hdrs(), json: async () => ({}) })
  });
  await s2.tick();
  assert.deepEqual(forgotten, [row.fingerprint]);
  assert.equal(s2.state().stopped, false);
  assert.equal(s2.state().waitUntil, 0, 'no back off on a deleted issue');
});

test('a 422 on search stops sending instead of dropping every row', async () => {
  // Value: protects=a reports repo the key cannot see never drops the whole queue one row at a time (state matrix); fails_when=search 422 maps to drop; why_new=search answers 422 when the repo cannot be seen; seam=injected fetch; no_claim=GitHub's 422 bodies
  const { sender, reporter, logs } = setup({ failures: 2, responses: [{ status: 422 }] });
  await sender.tick();
  assert.equal(sender.state().stopped, true);
  assert.equal(reporter.pending().length, 2, 'nothing dropped');
  assert.equal(logs[0].kind, 'failure-report-stopped');
});

test('a secondary rate limit 403 waits instead of stopping, and other client errors drop one row', async () => {
  // Value: protects=every office shares one key, so a burst after a release waits rather than going quiet for the run (red team); fails_when=a 403 without headers always stops, or a 409 retries the same row forever; why_new=red team; seam=injected fetch; no_claim=GitHub's exact secondary limit wording
  assert.equal(classifyResponse(403, hdrs(), 'You have exceeded a secondary rate limit.'), 'wait');
  assert.equal(classifyResponse(403, hdrs(), 'Resource not accessible by personal access token'), 'stop');
  assert.equal(classifyResponse(409, hdrs()), 'drop');
  const limited = setup({ responses: [{ status: 200, json: { items: [] } }, { status: 403, json: { message: 'You have exceeded a secondary rate limit' } }] });
  await limited.sender.tick();
  assert.equal(limited.sender.state().stopped, false);
  assert.ok(limited.sender.state().waitUntil > 0);
  assert.equal(limited.reporter.pending().length, 1);
  const conflict = setup({ failures: 2, responses: [{ status: 200, json: { items: [] } }, { status: 409 }, { status: 200, json: { items: [] } }, { status: 201, json: { number: 5 } }] });
  await conflict.sender.tick();
  assert.deepEqual(conflict.reporter.pending(), [], 'one dropped, the other sent');
});

test('a search 5xx backs off and keeps the row pending', async () => {
  // Value: protects=a GitHub outage during search loses nothing (state matrix); fails_when=a search 5xx drops or stops; why_new=untested cell; seam=injected fetch; no_claim=none beyond protects
  const { sender, reporter } = setup({ responses: [{ status: 503 }] });
  await sender.tick();
  assert.equal(reporter.pending().length, 1);
  assert.equal(sender.state().stopped, false);
  assert.ok(sender.state().waitUntil > 0);
});

test('a search hit counts only when its fields hash to the fingerprint; rejected issues are not searched', async () => {
  // Value: protects=a decoy whose body parses but whose fields do not hash to the title's fingerprint never swallows sightings the Action would reject (pass 2 red team); fails_when=the sender trusts the stated fingerprint; why_new=pass 2 red team; seam=injected fetch; no_claim=GitHub search ranking
  const { reporter } = setup();
  const row = reporter.pending()[0];
  const decoy = { ...parseIssueBody(issueBody(row)), errorName: 'RangeError' };
  const { sender, calls } = setup({ responses: [{ status: 200, json: { items: [{ number: 3, title: `[auto] router-throw RangeError (${row.fingerprint})`, body: issueBody(decoy) }] } }, { status: 201, json: { number: 8 } }] });
  await sender.tick();
  assert.match(decodeURIComponent(calls[0].url), /-label:rejected/);
  assert.match(calls[0].url, /sort=created&order=asc/);
  assert.equal(calls[1].method, 'POST');
  assert.match(calls[1].url, new RegExp(`/repos/${REPORTS_REPO}/issues$`), 'filed its own issue instead');
});
