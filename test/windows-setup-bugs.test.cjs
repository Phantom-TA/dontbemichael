'use strict';
// Two Windows bugs a new owner hits in setup (docs/designs/windows-11-installer.md,
// E2; were TODOS.md "Retry the secrets rename on Windows" and "Status check on
// Windows with the npm Claude shim").
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { writeFileAtomic } = loadTs('src/main/atomicFile.ts');
const { mcpListLaunch } = loadTs('src/main/claudeMcpList.ts');
const { hiddenClaudeLaunch } = loadTs('src/main/hiddenClaude.ts');

function fakeOps(renameFailures, platform = 'win32') {
  const calls = { renames: 0, sleeps: [], removed: [] };
  const ops = {
    openSync: () => 3,
    writeSync: (_fd, data) => Buffer.byteLength(data, 'utf8'),
    fsyncSync: () => {},
    closeSync: () => {},
    renameSync: () => {
      calls.renames++;
      const code = renameFailures.shift();
      if (code) throw Object.assign(new Error(code), { code });
    },
    rmSync: (p) => calls.removed.push(p),
    sleepSync: (ms) => calls.sleeps.push(ms),
    platform
  };
  return { ops, calls };
}

test('a save retries while antivirus briefly holds the file, then succeeds', () => {
  // Value: protects=secrets save on Windows when a scanner holds the file; fails_when=the first EBUSY/EPERM fails the save; why_new=E2; seam=none
  const { ops, calls } = fakeOps(['EBUSY', 'EPERM']);
  writeFileAtomic('/x/secrets.json', '{}', 0o600, ops);
  assert.equal(calls.renames, 3);
  assert.deepEqual(calls.sleeps, [100, 300]);
  assert.deepEqual(calls.removed, [], 'the temp file became the secrets file');
});

test('a save gives up after three retries, or at once for an unrelated error, and cleans up', () => {
  // Value: protects=a stuck file fails the save safely in about 1.3 s, and a real error is not retried; fails_when=retries never stop or retry ENOSPC; why_new=E2; seam=none
  const held = fakeOps(['EACCES', 'EACCES', 'EACCES', 'EACCES']);
  assert.throws(() => writeFileAtomic('/x/secrets.json', '{}', 0o600, held.ops), /EACCES/);
  assert.equal(held.calls.renames, 4);
  assert.deepEqual(held.calls.sleeps, [100, 300, 900]);
  assert.equal(held.calls.removed.length, 1, 'temp file removed');
  const full = fakeOps(['ENOSPC']);
  assert.throws(() => writeFileAtomic('/x/secrets.json', '{}', 0o600, full.ops), /ENOSPC/);
  assert.deepEqual(full.calls.sleeps, []);
});

test('a held rename is retried only on Windows; elsewhere the first EPERM fails the save at once', () => {
  // Value: protects=a failing save on a Mac never freezes the main process for about 1.3 s; fails_when=the retry runs on every platform; why_new=pre-landing review; seam=injected ops
  const mac = fakeOps(['EPERM', 'EPERM'], 'darwin');
  assert.throws(() => writeFileAtomic('/x/secrets.json', '{}', 0o600, mac.ops), /EPERM/);
  assert.equal(mac.calls.renames, 1);
  assert.deepEqual(mac.calls.sleeps, []);
  assert.equal(mac.calls.removed.length, 1, 'temp file removed');
});

test('the Claude status check runs a Windows claude.cmd through cmd.exe', () => {
  // Value: protects=the status reads on Windows npm installs; fails_when=execFile is handed the .cmd directly again; why_new=E2; seam=none
  const bin = 'C:\\Users\\José García\\AppData\\Roaming\\npm\\claude.cmd';
  const l = mcpListLaunch('win32', bin, 'C:\\Windows\\system32\\cmd.exe');
  assert.equal(l.file, 'C:\\Windows\\system32\\cmd.exe');
  assert.equal(l.windowsVerbatimArguments, true);
  assert.deepEqual(l.args, [`/d /s /c ""${bin}" mcp list"`]);
  assert.deepEqual(mcpListLaunch('win32', 'C:\\tools\\claude.exe'), { file: 'C:\\tools\\claude.exe', args: ['mcp', 'list'] });
  assert.deepEqual(mcpListLaunch('darwin', '/usr/local/bin/claude'), { file: '/usr/local/bin/claude', args: ['mcp', 'list'] });
});

test('hidden Claude runs a Windows claude.cmd through cmd.exe with preserved quotes for paths with spaces', () => {
  // Value: protects=hidden Claude sessions (trust layer, memory tidy, hire check) start when Windows username has a space; fails_when=bare unquoted exe splits at space in cmd.exe; why_new=#426; seam=none
  const bin = 'C:\\Users\\Jane Smith\\AppData\\Roaming\\npm\\claude.cmd';
  const args = ['--session-id', '1111', '--settings', '{"disableAllHooks":true}'];
  const l = hiddenClaudeLaunch('win32', bin, args, 'C:\\Windows\\system32\\cmd.exe');
  assert.equal(l.file, 'C:\\Windows\\system32\\cmd.exe');
  assert.equal(l.args, `/d /s /c ""${bin}" --session-id 1111 --settings "{\\"disableAllHooks\\":true}""`);
  assert.deepEqual(hiddenClaudeLaunch('win32', 'C:\\tools\\claude.exe', args), { file: 'C:\\tools\\claude.exe', args });
  assert.deepEqual(hiddenClaudeLaunch('darwin', '/usr/local/bin/claude', args), { file: '/usr/local/bin/claude', args });
});

test('hidden Claude keeps the empty --tools value when it goes through cmd.exe', () => {
  // Value: protects=no tools hidden calls (the trust layer reads web answers) stay without the owner's connectors; fails_when=an empty argument vanishes from the cmd.exe line, so --strict-mcp-config becomes the --tools value and connectors load; why_new=#426 review; seam=none
  const bin = 'C:\\Users\\Jane Smith\\AppData\\Roaming\\npm\\claude.cmd';
  const l = hiddenClaudeLaunch('win32', bin, ['--model', 'sonnet', '--tools', '', '--strict-mcp-config'], 'cmd.exe');
  assert.equal(l.args, `/d /s /c ""${bin}" --model sonnet --tools "" --strict-mcp-config"`);
});
