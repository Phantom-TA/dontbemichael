'use strict';
// Automatic failure reports, main side: notice, fold, keep (docs/designs/auto-report-failures.md, E3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const loadTs = require('./load-ts.cjs');
const { createFailureReporter, LEDGER_MAX_BYTES, PENDING_MAX_AGE_MS, MEMORY_ROWS_ON_WRITE_FAILURE } = loadTs('src/main/failureReport.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

function make(over = {}) {
  const files = new Map(over.files ?? []);
  const warnings = [];
  let now = over.now ?? 1_700_000_000_000;
  const r = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => now, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'),
    engineFor: (id) => (id === 'kelly' ? 'codex' : 'claude'), officeBreakActive: () => false, doNotTrack: () => false,
    signalName: (n) => (n === 11 ? 'SIGSEGV' : undefined),
    readFile: (p) => (files.has(p) ? files.get(p) : null),
    writeFile: (p, d) => { files.set(p, d); },
    warn: (w, e) => warnings.push([w, e]),
    ...over.deps
  });
  return { r, files, warnings, tick: (ms) => { now += ms; } };
}
const ledger = (files) => (files.get('/ud/failures.jsonl') ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l));

test('a repo fixable office event becomes one pending row; repeats only count', () => {
  // Value: protects=failures are kept once per fingerprint and version; fails_when=repeats add rows or owner events are kept; why_new=E3; seam=none; no_claim=real office logs (events stand in)
  const { r, files } = make();
  r.observe({ kind: 'drop', reason: 'hop-cap', from: 'pam', to: 'kelly' });
  r.observe({ kind: 'drop', reason: 'hop-cap', from: 'oscar', to: 'kelly' });
  r.observe({ kind: 'drop', reason: 'no-inbox', to: 'nobody' });
  r.observe({ kind: 'message', from: 'god' });
  r.flush();
  const rows = ledger(files);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'loop-messages');
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].state, 'pending');
  assert.match(rows[0].fingerprint, /^[0-9a-f]{12}$/);
  assert.doesNotMatch(files.get('/ud/failures.jsonl'), /pam|oscar|kelly/, 'no names are kept');
});

test('an exit or failed check during an office break is the owner\'s, never kept', () => {
  const { r, files } = make({ deps: { officeBreakActive: () => true } });
  r.observe({ kind: 'agent-exit', agentId: 'kelly', signal: 11 });
  r.observe({ kind: 'hire-check-fallback', reason: 'unreadable' });
  r.flush();
  assert.deepEqual(ledger(files), []);
});

test('an agent crash names the signal and the member\'s engine', () => {
  const { r, files } = make();
  r.observe({ kind: 'agent-exit', agentId: 'kelly', signal: 11, exitCode: 0 });
  r.flush();
  assert.equal(ledger(files)[0].detail, 'SIGSEGV');
  assert.equal(ledger(files)[0].engine, 'codex');
});

test('DO_NOT_TRACK keeps rows local; the flag off keeps nothing', () => {
  const dnt = make({ deps: { doNotTrack: () => true } });
  dnt.r.reportFailure('router-throw', new Error('x'));
  dnt.r.flush();
  assert.equal(ledger(dnt.files)[0].state, 'local');
  assert.deepEqual(dnt.r.pending(), []);
  const off = make({ deps: { enabled: false } });
  off.r.reportFailure('router-throw', new Error('x'));
  off.r.flush();
  assert.deepEqual(ledger(off.files), []);
});

test('a main process error keeps only the app\'s own frames and its code', () => {
  const { r, files } = make();
  const e = new TypeError('cannot read /Users/jane/secret');
  e.code = 'ERR_INVALID_ARG_TYPE';
  e.stack = 'TypeError: cannot read /Users/jane/secret\n    at Hive.routeOnce (/Applications/X.app/Contents/Resources/app.asar/out/main/index.js:3644:11)\n    at /Users/jane/x/node_modules/y.js:1:1';
  r.reportFailure('router-throw', e);
  r.flush();
  const row = ledger(files)[0];
  assert.deepEqual(row.frames, ['out/main/index.js:Hive.routeOnce:3644']);
  assert.equal(row.detail, 'ERR_INVALID_ARG_TYPE');
  assert.equal(row.errorName, 'TypeError');
  assert.doesNotMatch(files.get('/ud/failures.jsonl'), /jane|secret/);
});

test('renderer reports are scrubbed again and refused when malformed or frameless', () => {
  // Value: protects=main trusts nothing the renderer sends, and a renderer error with no app frame (ResizeObserver, "Script error.") is never one report from every office; fails_when=a record's own name reaches a title or frameless errors are kept; why_new=red team; seam=none; no_claim=real Chromium error events
  const { r, files } = make();
  r.reportRenderer({ kind: 'screen-crash', name: 'TypeError', stack: '    at Ve (file:///A.app/Contents/Resources/app.asar/out/renderer/assets/index-B1x_9aZq.js:88:1201)\n    at /Users/jane/x.js:1:1' });
  r.reportRenderer({ kind: 'main-uncaught', name: 'Error', stack: '' });
  r.reportRenderer('crash');
  r.reportRenderer({ kind: 'renderer-error', name: '<b>bad</b>', stack: 'x'.repeat(100000) });
  r.reportRenderer({ kind: 'renderer-error', name: 'ResizeObserver loop completed with undelivered notifications.', stack: '' });
  r.reportRenderer({ kind: 'renderer-error', name: 'Pete', stack: '    at go (file:///A.app/Contents/Resources/app.asar/out/renderer/assets/index-B1x_9aZq.js:3:4)' });
  r.flush();
  const rows = ledger(files);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find((x) => x.kind === 'screen-crash').frames, ['out/renderer/assets/index.js:-:88']);
  assert.equal(rows.find((x) => x.kind === 'renderer-error').errorName, 'Error');
});

test('the reporter never throws, even when its own parts fail', () => {
  const { r, warnings } = make({ deps: { sha256: () => { throw new Error('boom'); } } });
  assert.doesNotThrow(() => r.reportFailure('main-uncaught', new Error('x')));
  assert.doesNotThrow(() => r.observe({ kind: 'drop', reason: 'hop-cap' }));
  assert.ok(warnings.length >= 1);
});

test('a write that keeps failing holds at most 50 rows in memory', () => {
  const { r, warnings } = make({ deps: { writeFile: () => { const e = new Error('full'); e.code = 'ENOSPC'; throw e; } } });
  for (let i = 0; i < 60; i++) {
    const e = new Error('x');
    e.stack = `Error\n    at f${i} (/x/app.asar/out/main/index.js:${i + 1}:1)`;
    r.reportFailure('router-throw', e);
    if (i === 0) r.flush();
  }
  assert.ok(r.pending().length <= MEMORY_ROWS_ON_WRITE_FAILURE);
  assert.ok(warnings.some(([w]) => w === 'write'));
});

test('a saved file reads back: partial lines skipped, old pending rows dropped', () => {
  const now = 1_700_000_000_000;
  const good = { kind: 'router-throw', detail: 'none', errorName: 'Error', frames: [], fingerprint: 'aaaaaaaaaaaa', appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64', engine: 'claude', engineVersion: 'unknown', count: 1, ts: now - 1000, lastTs: now - 1000, state: 'pending' };
  const old = { ...good, fingerprint: 'bbbbbbbbbbbb', ts: now - PENDING_MAX_AGE_MS - 1 };
  const text = `${JSON.stringify(good)}\n${JSON.stringify(old)}\n{"kind":"router-thr`;
  const { r, files } = make({ now, files: [['/ud/failures.jsonl', text]] });
  assert.deepEqual(r.pending().map((x) => x.fingerprint), ['aaaaaaaaaaaa']);
  r.flush();
  assert.equal(ledger(files).find((x) => x.fingerprint === 'bbbbbbbbbbbb').state, 'dropped');
});

test('rotation keeps one old file and carries what is owed or names an issue', () => {
  const now = 1_700_000_000_000;
  const base = { kind: 'router-throw', detail: 'none', errorName: 'Error', frames: [], appVersion: '0.2.9', os: 'darwin', osVersion: '15.1.0', arch: 'arm64', engine: 'claude', engineVersion: 'unknown', count: 1, ts: now, lastTs: now };
  const lines = [];
  for (let i = 0; lines.join('\n').length < LEDGER_MAX_BYTES; i++) {
    lines.push(JSON.stringify({ ...base, fingerprint: i.toString(16).padStart(12, '0'), state: 'sent', sentAt: now, issue: i % 2 ? i : undefined, why: 'x'.repeat(400) }));
  }
  lines.push(JSON.stringify({ ...base, fingerprint: 'ffffffffffff', state: 'pending' }));
  const { r, files } = make({ now, files: [['/ud/failures.jsonl', lines.join('\n')]] });
  r.reportFailure('main-uncaught', new Error('x'));
  r.flush();
  assert.ok(files.has('/ud/failures.1.jsonl'));
  const kept = ledger(files);
  assert.ok(kept.length < lines.length);
  assert.ok(kept.every((x) => x.state === 'pending' || typeof x.issue === 'number'));
  assert.ok(kept.some((x) => x.fingerprint === 'ffffffffffff'));
});

test('sent rows give the issue for later versions and the recent fingerprints', () => {
  const { r, tick } = make();
  r.reportFailure('router-throw', new Error('x'));
  const [row] = r.pending();
  r.markSent(row, 41);
  assert.equal(r.issueFor(row.fingerprint), 41);
  assert.deepEqual(r.recentFingerprints(), [row.fingerprint]);
  r.forgetIssue(row.fingerprint);
  assert.equal(r.issueFor(row.fingerprint), undefined);
  tick(8 * 24 * 3600_000);
  assert.deepEqual(r.recentFingerprints(), []);
});

test('the office log observer feeds the reporter first and still feeds Pulse', () => {
  // Value: protects=Pulse telemetry keeps recording after the reporter joins (eng E-R2); fails_when=the observer is reassigned or the call moves after a return; why_new=index.ts observer had no test; seam=none; no_claim=Pulse counting itself
  const src = read('src/main/index.ts');
  const at = src.indexOf('hive.logObserver = (e) => {');
  assert.ok(at > 0);
  assert.equal(src.indexOf('hive.logObserver =', at + 1), -1, 'one assignment only');
  const body = src.slice(at, src.indexOf('\n};', at));
  assert.match(body, /^hive\.logObserver = \(e\) => \{\n  failures\.observe\(e\);/);
  assert.match(body, /pulseTelemetry\.record\(/);
});

test('the crash handlers still keep the app alive and log, and now report', () => {
  // Value: protects=a stray throw never takes the office down (eng E-R5); fails_when=a handler rethrows or exits; why_new=handlers had no test; seam=none; no_claim=a live crash
  const src = read('src/main/index.ts');
  for (const [ev, kind] of [['uncaughtException', 'main-uncaught'], ['unhandledRejection', 'main-rejection']]) {
    const at = src.indexOf(`process.on('${ev}'`);
    const body = src.slice(at, src.indexOf('});', at));
    assert.match(body, /console\.error\(/);
    assert.match(body, new RegExp(`failures\\.reportFailure\\('${kind}'`));
    assert.doesNotMatch(body, /throw |process\.exit|app\.(quit|exit)/);
  }
});

test('a known failure in a new app version is its own pending row and reuses the old issue', () => {
  // Value: protects=each release reports its own sighting of a known failure, as a comment on the existing issue (E3, one row per fingerprint and version); fails_when=rows fold by fingerprint alone, so a sent row swallows the new version, or issueFor stops spanning versions; why_new=every reporter test used one version; seam=none; no_claim=the real upgrade path (two reporters share one file)
  const err = () => { const e = new Error('x'); e.stack = 'Error\n    at f (/x/app.asar/out/main/index.js:7:1)'; return e; };
  const old = make();
  old.r.reportFailure('router-throw', err());
  const [row] = old.r.pending();
  old.r.markSent(row, 41);
  old.r.flush();
  const upgraded = make({ files: [...old.files], deps: { appVersion: '0.2.10' } });
  upgraded.r.reportFailure('router-throw', err());
  const pending = upgraded.r.pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].appVersion, '0.2.10');
  assert.equal(pending[0].fingerprint, row.fingerprint, 'the fingerprint ignores the version');
  assert.equal(pending[0].count, 1);
  assert.equal(upgraded.r.issueFor(row.fingerprint), 41);
  upgraded.r.flush();
  const kept = ledger(upgraded.files);
  assert.deepEqual(kept.map((x) => [x.appVersion, x.state]).sort(), [['0.2.10', 'pending'], ['0.2.9', 'sent']]);
});

test('the recent fingerprints are at most 5, the newest sent first', () => {
  // Value: protects=Report a problem names this office's latest automatic reports, not old ones (E7); fails_when=the cap moves, rows come oldest first, or a fingerprint sent in two versions is listed twice; why_new=only a single sent row was tested; seam=none; no_claim=GitHub prefilling the field
  const { r, tick } = make();
  const sent = [];
  for (let i = 0; i < 7; i++) {
    const e = new Error('x');
    e.stack = `Error\n    at g${i} (/x/app.asar/out/main/index.js:${i + 1}:1)`;
    r.reportFailure('router-throw', e);
  }
  for (const row of r.pending()) { tick(60_000); r.markSent(row, 100 + sent.length); sent.push(row.fingerprint); }
  assert.equal(sent.length, 7);
  assert.deepEqual(r.recentFingerprints(), sent.slice(2).reverse());
  const old = make();
  old.r.reportFailure('router-throw', new Error('x'));
  const [row] = old.r.pending();
  old.r.markSent(row, 1);
  old.r.flush();
  const both = make({ files: [...old.files], deps: { appVersion: '0.2.10' } });
  both.r.reportFailure('router-throw', new Error('x'));
  both.r.markSent(both.r.pending()[0], 1);
  assert.deepEqual(both.r.recentFingerprints(), [row.fingerprint], 'one fingerprint once, across versions');
});

test('a full disk is the owner\'s: never kept as a report', () => {
  // Value: protects=ENOSPC is not filed as an app bug (D11, plan kinds table); fails_when=a disk full error reaches the ledger; why_new=plan audit item 3; seam=none; no_claim=none beyond protects
  const { r, files } = make();
  const e = new Error('no space left on device');
  e.code = 'ENOSPC';
  r.reportFailure('main-uncaught', e);
  r.flush();
  assert.deepEqual(ledger(files), []);
});

test('an unreadable failure file gives Report a problem no fingerprints, never an error', () => {
  const { r } = make({ deps: { readFile: () => { throw new Error('EACCES'); } } });
  assert.deepEqual(r.recentFingerprints(), []);
});

test('a ledger that cannot be read for a moment is never overwritten; rows merge once it reads', () => {
  // Value: protects=rows an earlier session saved survive a busy or locked file (E3; QA ISSUE-001, captures 002/003); fails_when=load marks the file read after a failed read and flush writes only memory; why_new=QA reproduced the loss; seam=readFile throws; no_claim=the real OS error codes
  const saved = make();
  saved.r.reportFailure('router-throw', Object.assign(new TypeError('x'), { stack: 'TypeError: x\n    at a (/A/out/main/index.js:1:1)' }));
  saved.r.flush();
  const text = saved.files.get('/ud/failures.jsonl');
  let locked = true;
  const { r, files, warnings, tick } = make({ files: [['/ud/failures.jsonl', text]], deps: {
    readFile: (p) => { if (locked) throw Object.assign(new Error('busy'), { code: 'EBUSY' }); return files.get(p) ?? null; }
  } });
  r.reportFailure('hook-server', Object.assign(new TypeError('x'), { stack: 'TypeError: x\n    at b (/A/out/main/index.js:2:1)' }));
  r.reportFailure('router-throw', Object.assign(new TypeError('x'), { stack: 'TypeError: x\n    at a (/A/out/main/index.js:1:1)' }));
  r.flush();
  assert.equal(files.get('/ud/failures.jsonl'), text, 'nothing written while unread');
  assert.ok(warnings.some(([w]) => w === 'read'));
  locked = false;
  tick(30_000);
  r.flush();
  const rows = ledger(files);
  assert.deepEqual(rows.map((x) => x.kind).sort(), ['hook-server', 'router-throw']);
  assert.equal(rows.find((x) => x.kind === 'router-throw').count, 2, 'the saved count and the new one add up');
});

test('repeats only count, and reach the file at quit or with the next real change', () => {
  // Value: protects=a failure that keeps repeating after it was sent does not rewrite a 1 MB file every 30 s on the main thread, and its count is still saved at quit; fails_when=a count bump on a non pending row sets dirty, changes state, or is lost at quit; why_new=performance review and the state matrix; seam=writeFile counts; no_claim=real disk timing
  let writes = 0;
  const { r, files } = make({ deps: { writeFile: (p, d) => { writes++; files.set(p, d); } } });
  const e = (n) => Object.assign(new TypeError('x'), { stack: `TypeError: x\n    at f${n} (/A/out/main/index.js:${n}:1)` });
  r.reportFailure('router-throw', e(1));
  r.reportFailure('router-throw', e(2));
  r.reportFailure('router-throw', e(3));
  r.flush();
  const [a, b, c] = r.pending();
  r.markSent(a, 9);
  r.markDropped(b, '422');
  r.flush();
  const before = writes;
  for (let i = 0; i < 5; i++) { r.reportFailure('router-throw', e(1)); r.reportFailure('router-throw', e(2)); }
  r.flush();
  assert.equal(writes, before, 'no write for count only changes');
  r.flush(true);
  assert.equal(writes, before + 1);
  const rows = ledger(files);
  assert.equal(rows.find((x) => x.fingerprint === a.fingerprint).state, 'sent');
  assert.equal(rows.find((x) => x.fingerprint === a.fingerprint).count, 6);
  assert.equal(rows.find((x) => x.fingerprint === b.fingerprint).state, 'dropped');
  assert.equal(rows.find((x) => x.fingerprint === c.fingerprint).state, 'pending');
  r.reportFailure('router-throw', e(3));
  r.flush();
  assert.equal(writes, before + 1, 'a pending row\'s repeat waits too');
  assert.equal(r.pending()[0].count, 2, 'the sender reads the count from memory');
  r.reportFailure('hook-server', e(4));
  r.flush();
  assert.equal(ledger(files).find((x) => x.fingerprint === c.fingerprint).count, 2, 'a new row writes every count');
});

test('nothing is offered to the sender before the file is read, reads retry once a flush, and an unread file is never written', () => {
  // Value: protects=a row sent before the saved copy loads is never sent twice, a file that stays unreadable is never overwritten, and reads are not retried on every failure (pass 2 and 3 reviews, DeepSeek; owner D3: remove the give-up); fails_when=pending() serves memory rows before load, reads retry on every record, or the file is written while unread; why_new=pass 2 reviews and owner D3; seam=readFile throws, fake clock; no_claim=real OS error codes
  let reads = 0;
  let writes = 0;
  const { r, warnings, tick } = make({ deps: { readFile: () => { reads++; throw Object.assign(new Error('no access'), { code: 'EACCES' }); }, writeFile: () => { writes++; } } });
  const e = Object.assign(new TypeError('x'), { stack: 'TypeError: x\n    at a (/A/out/main/index.js:1:1)' });
  r.reportFailure('router-throw', e);
  r.reportFailure('hook-server', e);
  assert.deepEqual(r.pending(), []);
  assert.equal(r.issueFor('0123456789ab'), undefined);
  assert.equal(reads, 1, 'one read until the next flush interval');
  for (let i = 0; i < 30; i++) { tick(30_000); r.flush(); }
  assert.equal(reads, 31);
  assert.equal(writes, 0, 'an unread file is never written over');
  assert.ok(warnings.every(([w]) => w === 'read'));
  for (let i = 0; i < 60; i++) r.reportFailure('router-throw', Object.assign(new TypeError('x'), { stack: `TypeError: x\n    at f${i} (/A/out/main/index.js:${i + 2}:1)` }));
  assert.deepEqual(r.pending(), [], 'memory rows are held, capped, not sent');
});

test('sending waits while the reporter is told to hold', () => {
  // Value: protects=nothing is sent before DO_NOT_TRACK has been read from the shell (SR4, pass 2); fails_when=pending() ignores holdSending; why_new=pass 2 red team; seam=holdSending dep; no_claim=the shell read itself
  let hold = true;
  const { r } = make({ deps: { holdSending: () => hold } });
  r.reportFailure('router-throw', Object.assign(new TypeError('x'), { stack: 'TypeError: x\n    at a (/A/out/main/index.js:1:1)' }));
  assert.deepEqual(r.pending(), []);
  hold = false;
  assert.equal(r.pending().length, 1);
  assert.equal(r.pending()[0].state, 'pending', 'kept as pending, not local, while held');
});

test('a disk quota error is the owner\'s, like a full disk', () => {
  // Value: protects=EDQUOT joins ENOSPC as never reported (D11); fails_when=only ENOSPC is skipped; why_new=review note fix; seam=none; no_claim=none beyond protects
  const { r, files } = make();
  r.reportFailure('router-throw', Object.assign(new Error('x'), { code: 'EDQUOT' }));
  r.flush();
  assert.equal(ledger(files).length, 0);
});

test('a report carries the engine version the app knows, else unknown', () => {
  // Value: protects=an issue says which Claude Code build failed; fails_when=engineVersion is always unknown (issue 661 had unknown), or a malformed version is sent; why_new=issue 661; seam=none
  const { r, files } = make({ deps: { engineVersionFor: (id) => (id === 'kelly' ? null : '2.1.309') } });
  r.observe({ kind: 'agent-exit', agentId: 'pam', signal: 11, exitCode: 0 });
  r.observe({ kind: 'agent-exit', agentId: 'kelly', exitCode: 3 });
  r.flush();
  const rows = ledger(files);
  assert.equal(rows.find((x) => x.detail === 'SIGSEGV').engineVersion, '2.1.309');
  assert.equal(rows.find((x) => x.detail === 'code-3').engineVersion, 'unknown');
  const odd = make({ deps: { engineVersionFor: () => '2.1.309 (Claude Code)' } });
  odd.r.observe({ kind: 'agent-exit', agentId: 'pam', signal: 11, exitCode: 0 });
  odd.r.flush();
  assert.equal(ledger(odd.files)[0].engineVersion, 'unknown', 'anything but digits and dots is unknown');
});

test('a report carries the member\'s role, the app\'s uptime and the caller\'s checked context', () => {
  // Value: protects=a loop-agent report reaches the issue with the facts that tell its cause; fails_when=context is dropped on the way to the ledger, or an unchecked value is kept; why_new=issue 661; seam=none
  const { r, files, tick } = make({ deps: { roleFor: (id) => (id === 'god' ? 'michael' : 'member'), uptimeMs: () => 2 * 3600_000 } });
  r.reportFailure('loop-agent', undefined, { detail: 'error-storm:constrained', agentId: 'pam', context: { limit: '5', limitSet: 'invalid', codes: '529', note: 'free text', role: 'research' } });
  tick(1);
  r.reportFailure('main-uncaught', new TypeError('x'));
  r.flush();
  const [loop, crash] = ledger(files);
  assert.deepEqual(loop.context, { codes: '529', limit: '5', limitSet: 'invalid', role: 'research', uptime: '1-4h' }, 'the caller\'s role wins; unknown keys go');
  assert.deepEqual(crash.context, { uptime: '1-4h' }, 'no agent, no role');
  const { r: plain, files: f2 } = make();
  plain.reportFailure('main-uncaught', new TypeError('x'));
  plain.flush();
  assert.equal('context' in ledger(f2)[0], false, 'no facts, no context field');
});

test('a breaker trip is reported with what the breaker knew', () => {
  // Value: protects=the wiring from a breaker trip to a report with context; fails_when=index.ts reports loop-agent without the breaker's diagnosis; why_new=issue 661; seam=source
  const src = read('src/main/index.ts');
  assert.match(src, /failures\.reportFailure\('loop-agent', undefined, \{\s*detail: loop, agentId: d\.state\.agentId, context: loopAgentContext\(arm, breaker\.diagnosis\(d\.state\.agentId, arm\), now\)/);
  assert.match(src, /engineVersionFor: \(agentId\) => \(failureEngineFor\(agentId\) === 'claude' \? lastClaudeCliVersion\(\) : null\)/);
  assert.match(src, /breaker\.recordError\(agentId, querySource, statusCode\)/);
});
