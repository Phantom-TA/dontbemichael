'use strict';
// The hook channel cannot be taken over (docs/designs/windows-11-installer.md,
// S1). On Windows the channel is a named pipe in one namespace shared by every
// account on the PC; a name derived from the hive folder let another account
// create it first. The name is now random per launch, and if the channel fails
// to open no team member starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');
const loadTs = require('./load-ts.cjs');
const { HookServer } = loadTs('src/main/hooks.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('the Windows pipe name is random per launch, never derived from the hive folder', (t) => {
  // Value: protects=another account cannot predict and pre-create the pipe; fails_when=sockPath goes back to a hash of the hive root; why_new=S1; seam=none
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-pipe-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32' });
  try {
    const a = new HiveManager(() => home).sockPath();
    const b = new HiveManager(() => home).sockPath();
    assert.match(a, /^\\\\\.\\pipe\\dbm-hooks-[0-9a-f]{32}$/);
    assert.notEqual(a, b, 'same hive folder, different launch, different name');
  } finally {
    Object.defineProperty(process, 'platform', real);
  }
  assert.doesNotMatch(read('src/main/hive.ts'), /createHash\('sha1'\)\.update\(root\)\.digest\('hex'\)\.slice\(0, 12\);\n\s+return `\\\\\\\\\.\\\\pipe/);
});

test('a channel that fails to open blocks every team member from starting', async (t) => {
  // Value: protects=no agent runs unwatched or reports to a squatted channel; fails_when=a listen error is only logged and spawns continue; why_new=S1, eng finding 2; seam=none
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-chan-'));
  const win = process.platform === 'win32';
  // Windows: a live pipe of that name already exists, a real EADDRINUSE.
  // POSIX clears a stale socket file before listening, so the failure there is
  // a socket in a folder that does not exist.
  const sock = win ? `\\\\.\\pipe\\md-chan-${process.pid}-${Date.now()}` : path.join(base, 'missing', 'hooks.sock');
  const squatter = net.createServer(() => {});
  if (win) {
    squatter.listen(sock);
    await once(squatter, 'listening');
  }
  const logs = [];
  const hive = { sockPath: () => sock, appendLog: (e) => logs.push(e) };
  const server = new HookServer(hive, () => null, () => ({ notifications: false }));
  t.after(() => { server.stop(); squatter.close(); fs.rmSync(base, { recursive: true, force: true }); });
  server.start();
  // A spawn waits for the channel to settle, so the failure is known before it starts.
  await server.whenOpen();
  assert.ok(server.channelError(), 'known as soon as the wait ends');
  await new Promise(setImmediate);
  assert.equal(server.server.listening, false);
  if (win) {
    assert.match(server.channelError(), /^The office can't start its team: its private channel on this computer is in use \(EADDRINUSE\)\. Quit Don't Be Michael and open it again\.$/);
    assert.deepEqual(logs.at(-1), { kind: 'hook-server-error', code: 'EADDRINUSE' });
  } else {
    assert.match(server.channelError(), /^The office can't start its team: its private channel on this computer could not open \([A-Z]+\)\. Quit Don't Be Michael and open it again\.$/);
    assert.equal(logs.at(-1).kind, 'hook-server-error');
  }
  assert.doesNotMatch(server.channelError(), /[–—]| - /);
  const main = read('src/main/index.ts');
  assert.match(main, /if \(opts\.hive\) await hookServer\.whenOpen\(\);\n\s+const channelError = opts\.hive \? hookServer\.channelError\(\) : null;\n\s+if \(channelError\) return \{ ok: false, error: channelError \};/);
});

test('an error once the channel is open is logged but never blocks the team', async (t) => {
  // Value: protects=one refused connection or a moment out of file handles does not stop every spawn until a restart; fails_when=any server error sets the channel error; why_new=pre-landing review; seam=none
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-chan-'));
  const sock = process.platform === 'win32' ? `\\\\.\\pipe\\md-chan-open-${process.pid}-${Date.now()}` : path.join(base, 'hooks.sock');
  const logs = [];
  const server = new HookServer({ sockPath: () => sock, appendLog: (e) => logs.push(e) }, () => null, () => ({ notifications: false }));
  t.after(() => { server.stop(); fs.rmSync(base, { recursive: true, force: true }); });
  server.start();
  await once(server.server, 'listening');
  server.server.emit('error', Object.assign(new Error('accept EMFILE'), { code: 'EMFILE' }));
  assert.equal(server.channelError(), null);
  assert.deepEqual(logs.at(-1), { kind: 'hook-server-error', code: 'EMFILE' });
});

/** A team folder like one in Google Drive, whose hooks.sock runs past the
 *  104 bytes a socket path may hold on macOS (108 on Linux). */
function longHome(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-long-'));
  const home = path.join(base, 'Library', 'CloudStorage', 'GoogleDrive-owner.name@example-bakery.co.in', 'My Drive', 'Bakery Office');
  fs.mkdirSync(home, { recursive: true });
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return home;
}

test('a long team folder path gets a socket path that fits, in a private folder', { skip: process.platform === 'win32' }, (t) => {
  // Value: protects=the hook channel of an office kept in iCloud or Google Drive; fails_when=sockPath returns a path the OS cuts short; why_new=bug found by repro (EADDRINUSE from the second launch on); seam=none
  const home = longHome(t);
  const hive = new HiveManager(() => home);
  assert.ok(Buffer.byteLength(path.join(hive.root(), 'hooks.sock')) >= 104, 'the plain path really is too long');
  const sock = hive.sockPath();
  assert.ok(Buffer.byteLength(sock) < 104, sock);
  assert.equal(hive.sockPath(), sock, 'the same path for the whole launch');
  assert.equal(fs.statSync(path.dirname(sock)).mode & 0o777, 0o700, 'only this account can reach it');
  assert.notEqual(new HiveManager(() => home).sockPath(), sock, 'a new launch never reuses a path someone could predict');
  t.after(() => fs.rmSync(path.dirname(sock), { recursive: true, force: true }));
});

test('a long team folder path still opens its hook channel on the next launch', { skip: process.platform === 'win32' }, async (t) => {
  // Value: protects=team members can start after a restart or a crash; fails_when=the first launch's socket file, left under a cut short name, blocks the next listen; why_new=bug found by repro; seam=none
  const home = longHome(t);
  const launch = async () => {
    const server = new HookServer(new HiveManager(() => home), () => null, () => ({ notifications: false }));
    server.start();
    await server.whenOpen();
    return server;
  };
  // The first launch's socket is still there (it crashed, or Electron left it).
  const first = await launch();
  const second = await launch();
  t.after(() => { first.stop(); second.stop(); });
  assert.equal(first.channelError(), null);
  assert.equal(second.channelError(), null);
});
