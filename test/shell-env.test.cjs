'use strict';

// shellEnv.ts reads the user's PATH out of an interactive login shell with a
// BLOCKING spawnSync on the Electron main process. These tests drive a real zsh
// whose rc file can be made slow, the way nvm, conda or a cold network mount
// make a real one slow at first launch.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');

const shellEnv = loadTs('src/main/shellEnv.ts');

const ZSH = ['/bin/zsh', '/usr/bin/zsh'].find((p) => fs.existsSync(p));
const needsZsh = (reason) => {
  const opts = posixOnly(reason);
  return opts.skip ? opts : { skip: !ZSH && 'zsh is not installed' };
};

/** A ZDOTDIR (with a space in its path) whose .zshrc sleeps while `slow`
 *  exists, then puts its own `my bin` folder on PATH so a real capture is
 *  told apart from the process PATH it falls back to. */
function slowShell(t, sleepSeconds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shell env '));
  const slow = path.join(dir, 'slow');
  fs.writeFileSync(
    path.join(dir, '.zshrc'),
    `[ -f "$ZDOTDIR/slow" ] && sleep ${sleepSeconds}\nexport PATH="$ZDOTDIR/mybin:$PATH"\n`
  );
  fs.writeFileSync(slow, '');
  const saved = { SHELL: process.env.SHELL, ZDOTDIR: process.env.ZDOTDIR, PATH: process.env.PATH };
  process.env.SHELL = ZSH;
  process.env.ZDOTDIR = dir;
  // What a Finder or Dock launched app inherits from launchd.
  process.env.PATH = '/usr/bin:/bin:/usr/sbin:/sbin';
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    shellEnv.__resetShellEnvForTest();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return { dir, makeFast: () => fs.rmSync(slow) };
}

test('a slow login shell is killed at the timeout instead of blocking until its rc files finish', needsZsh('login shell capture'), (t) => {
  // Value: protects=the main process is blocked at most about the capture timeout; fails_when=the timed-out shell gets the default SIGTERM, which an interactive zsh ignores; why_new=new; seam=__resetShellEnvForTest timeout; no_claim=bash or fish
  slowShell(t, 4);
  shellEnv.__resetShellEnvForTest({ timeoutMs: 500 });
  const started = Date.now();
  const value = shellEnv.captureFromLoginShell('printf %s "$PATH"');
  const elapsed = Date.now() - started;
  assert.equal(value, null, 'a timed-out capture yields nothing');
  assert.ok(elapsed < 2500, `blocked ${elapsed} ms against a 500 ms timeout; the 4 s rc file ran to the end`);
});

test('a timed-out PATH capture is not kept for the session: the shell is asked again after the backoff', needsZsh('login shell capture'), (t) => {
  // Value: protects=agents get the real PATH once the shell answers, and a slow shell is not rerun on every spawn; fails_when=the launchd fallback is cached for the session, or the fallback retries at once; why_new=new; seam=__resetShellEnvForTest timeout and clock; no_claim=the exact 60 s backoff length
  const { dir, makeFast } = slowShell(t, 4);
  let clock = 1_000_000;
  // Room for a login zsh to also read /etc/zprofile and /etc/zshrc on a busy
  // runner once it is fast, still well under the 4 s sleep it times out on.
  shellEnv.__resetShellEnvForTest({ timeoutMs: 1500, now: () => clock });
  const mybin = path.join(dir, 'mybin');

  assert.equal(shellEnv.userShellPath(), '/usr/bin:/bin:/usr/sbin:/sbin', 'falls back to the process PATH');
  makeFast();

  // Inside the backoff the fallback is handed out without starting a shell.
  clock += 1000;
  const started = Date.now();
  assert.equal(shellEnv.userShellPath(), '/usr/bin:/bin:/usr/sbin:/sbin');
  assert.ok(Date.now() - started < 100, 'no shell is started inside the backoff');

  // Past it, the now fast shell answers and that answer is what agents get.
  clock += 60_000;
  const real = shellEnv.userShellPath();
  assert.ok(real.split(':').includes(mybin), `expected ${mybin} on ${real}`);
  assert.equal(shellEnv.userShellPath(), real, 'the real answer is cached');
});

test('every blocking interactive shell lookup in the main process is killed with SIGKILL at its timeout', () => {
  // Value: protects=no spawnSync of an interactive shell can outlive its timeout; fails_when=a `-ilc` spawnSync (shellEnv.ts, memory.ts) relies on the default SIGTERM; why_new=new; seam=none; no_claim=the shell actually dies (the first test proves that for shellEnv.ts)
  const mainDir = path.resolve(__dirname, '..', 'src/main');
  const found = [];
  for (const name of fs.readdirSync(mainDir).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(mainDir, name), 'utf8');
    for (const m of src.matchAll(/spawnSync\(/g)) {
      // The call through its options object: enough to see its args and opts.
      const call = src.slice(m.index, src.indexOf(');', m.index) + 2);
      if (!call.includes("'-ilc'")) continue;
      found.push(name);
      assert.match(call, /killSignal: 'SIGKILL'/, `${name}: an interactive shell spawnSync without killSignal: 'SIGKILL'`);
    }
  }
  assert.deepEqual(found.sort(), ['memory.ts', 'shellEnv.ts'], 'the guard still sees both lookups');
});
