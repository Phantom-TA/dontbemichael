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

test('renderer reports are scrubbed again and refused when malformed', () => {
  const { r, files } = make();
  r.reportRenderer({ kind: 'screen-crash', name: 'TypeError', stack: '    at Ve (file:///A.app/Contents/Resources/app.asar/out/renderer/assets/index-B1x_9aZq.js:88:1201)\n    at /Users/jane/x.js:1:1' });
  r.reportRenderer({ kind: 'main-uncaught', name: 'Error', stack: '' });
  r.reportRenderer('crash');
  r.reportRenderer({ kind: 'renderer-error', name: '<b>bad</b>', stack: 'x'.repeat(100000) });
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
