'use strict';

/**
 * Desktop notifications start on at setup (owner, 2026-10-29). A fresh install
 * has no config.json, so setup shows and saves the default; an install that
 * already saved a choice keeps it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md notifications default '));
const configFile = path.join(userData, 'config.json');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };
const { readConfig, writeConfig } = loadTs('src/main/config.ts');
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

test('setup starts with desktop notifications on, and a saved choice is kept', () => {
  // Value: protects=owner 2026-10-29 (notifications on by default at setup); fails_when=a fresh install starts with notifications off, setup's switch shows off, or an owner who turned them off gets them back; why_new=default flipped from off; seam=source pin for the wizard switch; no_claim=the OS permission prompt
  fs.rmSync(configFile, { force: true });
  assert.equal(readConfig().notifications, true, 'a fresh install reads on');
  writeConfig({ onboardingComplete: true });
  assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).notifications, true, 'the first save keeps it on');
  writeConfig({ notifications: false });
  assert.equal(readConfig().notifications, false, 'an owner who turned them off stays off');
  const wizard = fs.readFileSync(path.resolve(__dirname, '..', 'src/renderer/src/components/OnboardingWizard.tsx'), 'utf8');
  assert.match(wizard, /const \[notifications, setNotifications\] = useState\(true\);/, 'the setup switch starts on');
});
