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
