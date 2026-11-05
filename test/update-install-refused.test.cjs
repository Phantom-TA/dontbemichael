'use strict';

/**
 * A staged update the install refuses (2026-10-28).
 *
 * An install of 0.2.4, ad hoc signed, downloaded 0.2.9, which is signed with a
 * Developer ID. Squirrel refuses a bundle that does not meet the running app's
 * designated requirement, so every Restart to update failed within two
 * seconds, and the update toast came straight back offering the same Restart.
 * The manual download that does work was never offered: `downloaded` outranks
 * `available-manual`, so the fallback's offer was dropped. These checks keep a
 * refused install on the manual download for that version.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const { reduceStatus, isInstallRefusal, describeUpdate } = loadTs('src/shared/updateState.ts');

const SIGNATURE_ERROR = "Code signature at URL file:///Users/x/Library/Caches/io.github.example.ShipIt/update.4q87kHD/App.app/ did not pass validation: code failed to satisfy specified code requirement(s)";
const staged = { state: 'downloaded', version: '0.2.9', notes: 'notes' };
const refused = { state: 'available-manual', version: '0.2.9', url: 'https://example.com/r', reason: SIGNATURE_ERROR, installFailed: true, downloadUrl: 'https://example.com/a.dmg' };

test('a signature refusal is told apart from a passing error', () => {
  // Value: protects=only a refusal that can never succeed moves the update off Restart; fails_when=the matcher misses Squirrel's signature message or catches a network error; why_new=new behavior; seam=none
  assert.equal(isInstallRefusal(SIGNATURE_ERROR), true);
  assert.equal(isInstallRefusal('The command is disabled and cannot be executed'), false);
  assert.equal(isInstallRefusal('net::ERR_INTERNET_DISCONNECTED'), false);
});

test('a refused install replaces the staged update, and the same download again never brings Restart back', () => {
  // Value: protects=the owner is offered the download that works instead of a Restart that fails every time; fails_when=downloaded keeps outranking a refused install, or the next 6 hour download of the same version restores Restart; why_new=the 2026-10-28 loop; seam=none
  const s = reduceStatus(staged, refused);
  assert.equal(s.state, 'available-manual');
  assert.equal(s.installFailed, true);
  assert.equal(reduceStatus(s, staged), s, 'the same version downloaded again is refused again');
  assert.equal(reduceStatus(s, { state: 'error', message: 'ETIMEDOUT' }), s);
  assert.equal(reduceStatus(s, { state: 'checking' }), s);
  const newer = { state: 'downloaded', version: '0.3.0' };
  assert.deepEqual(reduceStatus(s, newer), newer, 'a newer release still gets its own try');
  // A plain fallback offer still never replaces a staged update that works.
  const plain = { ...refused, installFailed: undefined };
  assert.deepEqual(reduceStatus(staged, plain), staged);
  assert.equal(describeUpdate(s, '0.2.4').action, 'manual');
});

test('main moves a refused install to the manual download, and the toast keeps what main pushed', () => {
  // Value: protects=the wiring: the error event settles the restart and offers the download, and the toast never restores the old Restart over it; fails_when=the updater emits error only for a refusal, or the toast puts back its old status after a failed restart; why_new=new behavior; seam=none (source pins, no Electron or DOM harness)
  const updater = read('src/main/updater.ts');
  assert.match(updater, /if \(pendingRestart && lastStatus\?\.state === 'downloaded' && isInstallRefusal\(message\)\) \{/);
  const branch = updater.slice(updater.indexOf('isInstallRefusal(message)) {'), updater.indexOf("emit({ state: 'error', message });", updater.indexOf('isInstallRefusal(message)) {')));
  assert.match(branch, /state: 'available-manual', version, notes, reason: message, installFailed: true,/);
  assert.match(branch, /downloadUrl: installerUrl\(version, process\.platform, process\.arch\)/);
  assert.match(branch, /failPendingRestart\(message\);\s*return;/);
  const toast = read('src/renderer/src/components/UpdateToast.tsx');
  assert.match(toast, /if \(!res\.ok\) \{ setStatus\(\(cur\) => cur \?\? prev\); setBusy\(false\); \}/);
  assert.doesNotMatch(toast, /setStatus\(prev\)/);
});
