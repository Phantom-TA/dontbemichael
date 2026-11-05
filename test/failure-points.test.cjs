'use strict';
// Automatic failure reports: the points that used to fail silently now report,
// and still behave as before (docs/designs/auto-report-failures.md, T3).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { breakerArm } = loadTs('src/shared/failureReport.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { PtyManager } = loadTs('src/main/pty.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('a breaker loop is reported; the owner\'s own caps are not', () => {
  assert.equal(breakerArm('looping: 8× identical tool call (Bash)'), 'repeat');
  assert.equal(breakerArm('error storm: 12 consecutive api errors/retries'), 'error-storm');
  assert.equal(breakerArm('token velocity 90000/min > 50000/min'), 'velocity');
  assert.equal(breakerArm('no-progress: generating tokens without coordinating (stale log/files)'), 'no-progress');
  for (const cap of ['token limit: 1,000 work tokens over the agent cap of 900 (x)', 'cost cap: floor total over $5 (top spender $2.00)', 'token cap: floor total over 100 tokens (top spender 50)']) {
    assert.equal(breakerArm(cap), null, cap);
  }
  // The breaker's own words, so a reworded reason fails here, not silently.
  const breaker = read('src/main/breaker.ts');
  for (const w of ['`looping: ', '`error storm: ', '`token velocity ', "'no-progress: "]) assert.ok(breaker.includes(w), w);
});

test('the router keeps ticking after a throw and reports it', async (t) => {
  // Value: protects=a throwing router tick never stops routing and is no longer silent (eng E-R5); fails_when=the catch rethrows or drops the report; why_new=hive.ts:3644 swallowed it; seam=none; no_claim=a real routing bug
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-router-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  let ticks = 0;
  const seen = [];
  hive.routeOnce = () => { ticks++; throw new Error('boom'); };
  hive.failureObserver = (kind, e) => seen.push([kind, e.message]);
  t.mock.timers.enable({ apis: ['setInterval'] });
  hive.startRouter(5);
  for (let i = 0; i < 3; i++) t.mock.timers.tick(5);
  clearInterval(hive.routerTimer);
  assert.equal(ticks, 3, 'the router kept ticking after each throw');
  assert.deepEqual(seen, [['router-throw', 'boom'], ['router-throw', 'boom'], ['router-throw', 'boom']]);
});

test('a reporter that throws never stops the router', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-router-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  let ticks = 0;
  hive.routeOnce = () => { ticks++; throw new Error('boom'); };
  hive.failureObserver = () => { throw new Error('reporter broke'); };
  t.mock.timers.enable({ apis: ['setInterval'] });
  hive.startRouter(5);
  t.mock.timers.tick(5);
  t.mock.timers.tick(5);
  clearInterval(hive.routerTimer);
  assert.equal(ticks, 2);
});

test('a hook handler that throws, a bridge that fails and the lossy cmd fallback all report', () => {
  const hooks = read('src/main/hooks.ts');
  assert.match(hooks, /try \{ res = this\.handle\(payload\); \} catch \(e\) \{\n\s+try \{ this\.hive\.failureObserver\?\.\('hook-server', e\); \}/);
  const hive = read('src/main/hive.ts');
  assert.match(hive, /bridge failed:`, e\);\n\s+try \{ this\.failureObserver\?\.\('bridge-install', e\); \}/);
  const pty = read('src/main/pty.ts');
  assert.match(pty, /if \(multiline\) \{ try \{ this\.onFailure\?\.\('cmd-fallback', 'multiline'\); \}/);
  const index = read('src/main/index.ts');
  assert.match(index, /ptyManager\.onFailure = \(kind, detail\) => failures\.reportFailure\(kind, undefined, \{ detail \}\);/);
  assert.match(index, /hive\.failureObserver = \(kind, e\) => failures\.reportFailure\(kind, e\);/);
  assert.match(index, /ipcMain\.on\('failure:report', \(_evt, f: unknown\) => \{ failures\.reportRenderer\(f\); \}\);/);
});

test('screen crashes and renderer errors send only a name and a stack', () => {
  const boundary = read('src/renderer/src/components/ErrorBoundary.tsx');
  assert.match(boundary, /reportRendererFailure\('screen-crash', error\)/);
  assert.match(boundary, /window\.cth\.reportFailure\?\.\(\{ kind, name: e\?\.name \?\? 'Error', stack: \(e\?\.stack \?\? ''\)\.slice\(0, 8192\) \}\)/);
  assert.doesNotMatch(boundary, /message/);
  const entry = read('src/renderer/src/main.tsx');
  assert.match(entry, /addEventListener\('error', \(e\) => reportRendererFailure\('renderer-error', e\.error\)\)/);
  assert.match(entry, /addEventListener\('unhandledrejection', \(e\) => reportRendererFailure\('renderer-error', e\.reason\)\)/);
});

// POSIX only: it spawns /bin/sh through a real PtyManager, as agent-exit-signal-e2e does.
test('an agent the app stops itself never reaches the exit report', { skip: process.platform === 'win32' ? 'spawns /bin/sh' : false }, async () => {
  // Value: protects=owner stop, respawn, quit and breaker stop are never filed as crashes; fails_when=a late exit of a killed session reaches the exit handler; why_new=pty.ts:720 guard untested for this; seam=none; no_claim=Windows ConPTY exit timing
  const mgr = new PtyManager();
  const exits = [];
  mgr.setExitHandler((id, code, info) => exits.push([id, code, info]));
  const res = mgr.spawn({ id: 'p1', cwd: os.tmpdir(), command: '/bin/sh', args: ['-c', 'sleep 30'] });
  assert.equal(res.ok, true, res.error);
  // gstack-timing-ok: a real child process; the wait lets it start before the kill
  await wait(150);
  assert.equal(mgr.kill('p1').ok, true);
  // gstack-timing-ok: the contract is that no exit arrives; the wait outlasts a killed sh's exit (tens of ms)
  await wait(400);
  assert.deepEqual(exits, []);
});

test('release builds carry the reports key into the app, and only a keyed build sends', () => {
  // Value: protects=official releases can file reports at all; fails_when=the release Compile step loses FAILURE_REPORT_KEY, the main bundle stops defining __REPORT_KEY__, or the sender starts without the key; why_new=the canary posts with the CI secret directly, so it stays green while a release ships with an empty key; seam=none; no_claim=the secret's value or GitHub Actions runtime
  const vite = read('electron.vite.config.ts');
  assert.match(vite, /const defineMain = \{[\s\S]*?__REPORT_KEY__: JSON\.stringify\(process\.env\.FAILURE_REPORT_KEY \?\? ''\)[\s\S]*?\};/);
  assert.match(vite, /main: \{[\s\S]*?define: defineMain/);
  const release = read('.github/workflows/release.yml');
  const compile = release.slice(release.indexOf('run: npm run build'), release.indexOf('\n      - ', release.indexOf('run: npm run build')));
  assert.ok(compile.length > 0, 'the release Compile step exists');
  assert.match(compile, /FAILURE_REPORT_KEY: \$\{\{ secrets\.FAILURE_REPORT_KEY \}\}/);
  const index = read('src/main/index.ts');
  assert.match(index, /createFailureSender\(\{\n\s+key: __REPORT_KEY__,/);
  assert.match(index, /if \(AUTO_FAILURE_REPORTS && __REPORT_KEY__\) \{\n\s+(?:\/\/.*\n\s+)?setTimeout\(\(\) => \{ void failureSender\.tick\(\); \}, 60_000 \+ Math\.floor\(Math\.random\(\) \* 4 \* 60_000\)\)\.unref\(\);\n\s+setInterval\(\(\) => \{ void failureSender\.tick\(\); \}, SEND_EVERY_MS\)\.unref\(\);/);
});

test('the breaker beat reports a loop on constrain and stop, as a valid report, and never a steer or an owner cap', () => {
  // Value: protects=a member stuck in a loop reaches the ledger as loop-agent, and the owner's own spending or token caps never do (D11); fails_when=the detail wording drifts from the schema (validateReport refuses it and the report is silently dropped), a steer starts reporting, or a cap reason is reported; why_new=only breakerArm was tested, not runBreakerBeat's guard and detail; seam=none (the real breaker decides; loopAgentDetail is what runBreakerBeat calls); no_claim=the beat's timing and its other actions
  const crypto = require('node:crypto');
  const { CircuitBreaker } = loadTs('src/main/breaker.ts');
  const { createFailureReporter } = loadTs('src/main/failureReport.ts');
  const { loopAgentDetail } = loadTs('src/shared/failureReport.ts');
  // runBreakerBeat reports exactly what loopAgentDetail returns.
  assert.match(read('src/main/index.ts'), /const loop = loopAgentDetail\(d\.action, reason\);\n\s+const arm = breakerArm\(reason\);[\s\S]{0,300}?if \(loop && arm\) \{\n\s+failures\.reportFailure\('loop-agent', undefined, \{\n\s+detail: loop, agentId: d\.state\.agentId, context: loopAgentContext\(arm, breaker\.diagnosis\(d\.state\.agentId, arm\), now\)/);

  const warnings = [];
  const reporter = createFailureReporter({
    enabled: true, ledgerPath: '/ud/failures.jsonl', appVersion: '0.2.9', platform: 'darwin', osVersion: '15.1.0', arch: 'arm64',
    now: () => 1_700_000_000_000, sha256: (s) => crypto.createHash('sha256').update(s).digest('hex'),
    engineFor: () => 'claude', officeBreakActive: () => false, doNotTrack: () => false, signalName: () => undefined,
    readFile: () => null, writeFile: () => {}, warn: (w, e) => warnings.push([w, e])
  });
  const feed = (d) => {
    const detail = loopAgentDetail(d.action, d.state.reason);
    if (detail) reporter.reportFailure('loop-agent', undefined, { detail, agentId: d.state.agentId });
  };

  // The real breaker, with hard stop on, climbs steer -> constrain -> stop on a loop and on an error storm.
  const T0 = 1_000_000_000_000;
  const actions = [];
  for (const [id, trip] of [['loopy', (b, now) => { for (let i = 0; i < 8; i++) b.recordToolUse('loopy', 'Bash', { command: 'ls' }, now); }],
    ['stormy', (b) => { for (let i = 0; i < 5; i++) b.recordError('stormy'); }]]) {
    const b = new CircuitBreaker(() => ({ enabled: true, hardStop: true, repeatedToolLimit: 8, errorStormLimit: 5, tokenVelocityPerMin: 60000 }));
    trip(b, T0);
    for (let i = 0; i < 3; i++) {
      const [d] = b.tick([{ agentId: id, sample: null, progressing: true }], T0 + i * 30_000);
      actions.push(`${id}:${d.action}`);
      feed(d);
    }
  }
  assert.deepEqual(actions, ['loopy:steer', 'loopy:constrain', 'loopy:stop', 'stormy:steer', 'stormy:constrain', 'stormy:stop']);
  // Velocity and no-progress need usage samples over time; their reasons are the breaker's own words (checked above).
  for (const reason of ['token velocity 90000/min > 60000/min', 'no-progress: generating tokens without coordinating (stale log/files)']) {
    for (const action of ['steer', 'constrain', 'stop']) feed({ state: { agentId: 'm', reason }, action });
  }
  // The owner's caps, from the real breaker's cost cap and in its words for the others.
  const capped = new CircuitBreaker(() => ({ enabled: true, hardStop: true, costCapUsd: 1, repeatedToolLimit: 8, errorStormLimit: 5, tokenVelocityPerMin: 60000 }));
  const sample = { agentId: 'spender', sessionId: 's', ts: T0, input: 1, output: 1, cacheRead: 0, cacheCreation: 0, model: 'm', usd: 5 };
  for (let i = 0; i < 3; i++) {
    const [d] = capped.tick([{ agentId: 'spender', sample: { ...sample, ts: T0 + i * 30_000 }, progressing: true }], T0 + i * 30_000);
    assert.match(d.state.reason, /^cost cap: /);
    feed(d);
  }
  for (const reason of ['token limit: 1,000 work tokens over the agent cap of 900 (1,000 total incl. cache reads)', 'token cap: floor total over 100 tokens (top spender 50)']) {
    for (const action of ['constrain', 'stop']) feed({ state: { agentId: 'm', reason }, action });
  }

  assert.deepEqual(warnings, [], 'every detail the beat builds passes the schema');
  const details = reporter.pending().map((r) => `${r.kind} ${r.detail}`).sort();
  assert.deepEqual(details, [
    'loop-agent error-storm:constrained', 'loop-agent error-storm:stopped',
    'loop-agent no-progress:constrained', 'loop-agent no-progress:stopped',
    'loop-agent repeat:constrained', 'loop-agent repeat:stopped',
    'loop-agent velocity:constrained', 'loop-agent velocity:stopped'
  ]);
});

test('kept failures reach the file every 30 seconds and at quit', () => {
  // Value: protects=failures noticed in the last moments before a quit are not lost, and the file is written at most every 30 s (E3); fails_when=the flush timer or the before-quit flush is removed, the timer keeps the app from quitting, or the quit flush moves behind an early return; why_new=index.ts flush wiring had no test; seam=none; no_claim=Electron's real quit sequence
  const { FLUSH_MS } = loadTs('src/main/failureReport.ts');
  assert.equal(FLUSH_MS, 30_000);
  const index = read('src/main/index.ts');
  const made = index.indexOf('const failures = createFailureReporter({');
  const timer = index.indexOf('setInterval(() => failures.flush(), FLUSH_MS).unref();');
  assert.ok(made > 0 && timer > made, 'the timer starts once the reporter exists, and is unref\'d');
  assert.equal(index.split('failures.flush(), FLUSH_MS').length, 2, 'one timer only');
  const quit = index.indexOf("app.on('before-quit', (e) => {");
  assert.ok(quit > 0);
  assert.match(index.slice(quit), /^app\.on\('before-quit', \(e\) => \{\n  failures\.flush\(true\);\n  if \(allowQuit\) return;/, 'the flush runs before any early return');
});

test('DO_NOT_TRACK set in the login shell counts, fails closed, and is read away from crash handlers', () => {
  // Value: protects=a Mac app opened from the Dock honours an export in ~/.zshrc or fish config, and a shell that cannot be read holds sending (SR4; security review, pass 2); fails_when=doNotTrack reads process.env only, a failed read counts as unset, or the blocking read runs in a crash handler or in builds that cannot send; why_new=security review and pass 2 red team; seam=none; no_claim=every shell's rc behaviour
  const index = read('src/main/index.ts');
  assert.match(index, /doNotTrack: \(\) => dntSet\(\) \|\| shellDnt === true,/);
  assert.match(index, /holdSending: \(\) => shellDnt === null,/);
  assert.match(index, /if \(AUTO_FAILURE_REPORTS && __REPORT_KEY__ && !dntSet\(\)\) \{/);
  assert.match(index, /const retryMs = \[10 \* 60_000, 30 \* 60_000, 2 \* 3600_000, 6 \* 3600_000\];/, 'failed reads back off');
  assert.match(index, /shellDnt = userShellDoNotTrack\(\);\n    if \(shellDnt !== null\) return;\n    if \(tries === 0\) \{ try \{ hive\.appendLog\(\{ kind: 'failure-report-held', reason: 'shell-unread' \}\);/, 'the hold is said once in the log');
  assert.match(index, /setTimeout\(readShellDnt, retryMs\[Math\.min\(tries\+\+, retryMs\.length - 1\)\]\)\.unref\(\);/);
  assert.ok(index.indexOf('let shellDnt: boolean | null = null;') < index.indexOf('const failures = createFailureReporter({'), 'declared before the reporter can call it');
  const shell = read('src/main/shellEnv.ts');
  assert.match(shell, /captureFromLoginShell\('printenv DO_NOT_TRACK'\)/);
  assert.match(shell, /if \(out === null\) return null;/, 'a failed read is not cached as unset');
});
