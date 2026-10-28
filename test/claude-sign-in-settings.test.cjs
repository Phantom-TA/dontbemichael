'use strict';

/**
 * Claude sign in in Settings, and a way off an empty API key (2026-10-28).
 *
 * A business owner reinstalled over an office set up before, so the wizard was
 * skipped. The office ran on an Anthropic API key whose account was out of
 * credit, and the stop card offered only Add credit and Try again. Nothing in
 * Settings, or anywhere else, showed that the team used a key, which account,
 * or how to switch to the owner's Claude account. These checks keep a place
 * that shows and changes it, and keep the switch safe for a stopped team.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('Settings > Agents shows how the team signs in to Claude, and never installs on its own', () => {
  // Value: protects=an office that skipped the wizard can still see and change its Claude sign in; fails_when=the group leaves Agents, shows before Claude is here, or opening Settings starts an install; why_new=new behavior; seam=none (source pins, no DOM harness)
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /\{activeSection === 'Agents' && \(\s*<>\s*<ClaudeSignInSettings \/>/);
  const group = read('src/renderer/src/components/ClaudeSignInSettings.tsx');
  assert.match(group, /if \(!engineSetup\?\.applies \|\| !engineSetup\.installed\) return null;/, 'a missing Claude keeps its own Needs you card');
  assert.match(group, /<GetMichaelReady manage \/>/);
  const ready = read('src/renderer/src/components/GetMichaelReady.tsx');
  assert.match(ready, /!autoInstalled\.current && !manage\) \{/);
});

test('a ready sign in offers the other way in: a new key, a Claude account, or a key in place of an account', () => {
  // Value: protects=the owner can leave an API key for the Claude account (and back) from Settings or the stop card; fails_when=the ready rows lose their manage buttons, or the switch to an account stops opening the sign in; why_new=new behavior; seam=none (source pins)
  const ready = read('src/renderer/src/components/GetMichaelReady.tsx');
  const keyRow = ready.slice(ready.indexOf("status={t('engineSetup.usingApiKey')}>"), ready.indexOf(') : (', ready.indexOf("status={t('engineSetup.usingApiKey')}>")));
  assert.match(keyRow, /\{manage && \(/);
  assert.match(keyRow, /onClick=\{\(\) => setKeyForm\(true\)\}>\{t\('engineSetup\.changeKey'\)\}/);
  assert.match(keyRow, /onClick=\{\(\) => \{ setSignedInAgain\(false\); setSwitching\(true\); void signIn\(\); \}\}>\{t\('engineSetup\.useAccount'\)\}/);
  assert.match(ready, /\{manage && \(\s*<div style=\{actions\}>\s*<PixelButton variant="secondary" size="sm" onClick=\{\(\) => setKeyForm\(true\)\}>\{t\('engineSetup\.useApiKey'\)\}/, 'an account office can move to a key');
  // A switch in progress shows the browser row, then the account once signed in.
  assert.match(ready, /const signInPending = !signedInAgain && \(\(fix === 'signin' && status\?\.method !== 'apiKey'\) \|\| switching\);/);
  assert.match(ready, /if \(signInPending\) return browser \? browserRow : \(/);
  assert.match(ready, /\{switching && <PixelButton variant="ghost" size="sm" onClick=\{\(\) => \{ setSwitching\(false\); setSignInStuck\(false\); \}\}>/, 'the owner can stay on the key');
});

test('out of credit on an API key offers Change sign in; on an account it does not', () => {
  // Value: protects=an owner whose key account is empty is never left with only Add credit; fails_when=the button shows on an account office or opens the dialog without manage; why_new=the 2026-10-28 business user case; seam=none (source pins)
  const card = read('src/renderer/src/components/OfficeBreakNotice.tsx');
  assert.match(card, /const onKey = engineSetup\?\.method === 'apiKey';/);
  assert.match(card, /\{onKey && <PixelButton variant="secondary" size="sm" onClick=\{\(\) => \{ setReady\(false\); setFix\('manage'\); \}\}>\{t\('officeStop\.changeSignIn'\)\}<\/PixelButton>\}/);
  assert.match(card, /<GetMichaelReady fix=\{fix === 'manage' \? undefined : fix\} manage onReadyChange=\{setReady\} \/>/);
  assert.match(card, /t\(onKey \? 'officeStop\.creditKeyInfo' : 'officeStop\.creditInfo'\)/);
});

test('a new sign in restarts the running Claude terminals, and an owner stop checks again', () => {
  // Value: protects=a stopped team picks up a new key or the Claude account at once, instead of keeping the empty key in its environment; fails_when=a credit stop is left out, a change while the office runs skips the restart, or the useApiKey handler stops calling the shared step; why_new=only a sign in stop restarted before; owner 2026-10-28 chose restart at once on any change; seam=none (source pins, main has no IPC harness)
  const main = read('src/main/index.ts');
  const handler = main.slice(main.indexOf("ipcMain.handle('engineSetup:useApiKey'"), main.indexOf('function claudeAuthChanged('));
  assert.match(handler, /writeConfig\(\{ claudeAuth: 'apiKey' \}\);[\s\S]*accountSignInFromKey = false;\s*claudeAuthChanged\(\);\s*return \{ ok: true \};/);
  assert.doesNotMatch(handler, /reason === 'signin'/, 'a credit stop restarts too');
  // A change from Settings while the office runs restarts the team too: a
  // member left on the old key would fail every Try again of a later stop.
  const changed = main.slice(main.indexOf('function claudeAuthChanged('), main.indexOf('function runningClaudePtys('));
  assert.match(changed, /\{\s*try \{ liveWebContents\(\)\?\.send\('office:restartClaude', runningClaudePtys\(\)\); \} catch \{ \/\* window gone \*\/ \}\s*if \(stopNeedsOwner\(officeBreak\.view\(\)\)\) ownerRetryOffice\(\);\s*\}/);
  assert.doesNotMatch(changed, /if \(!stopNeedsOwner/, 'the restart never waits for a stop');
  const { stopNeedsOwner } = require('./load-ts.cjs')('src/shared/officeBreak.ts');
  const view = (reason) => ({ until: null, checking: false, reason, again: false });
  assert.equal(stopNeedsOwner(view('credit')), true);
  assert.equal(stopNeedsOwner(view('signin')), true);
  assert.equal(stopNeedsOwner(view('limit')), false, 'a plan limit break never restarts the team');
  assert.equal(stopNeedsOwner(null), false);
});

test('the new words exist in every language, with no dashes', () => {
  // Value: protects=no raw key or English fallback in Chinese or Arabic, and the no dashes copy rule; fails_when=a locale misses one of the new strings or uses a dash; why_new=new strings; seam=none
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const j = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    const words = [j.settings.claudeSignIn.title, j.settings.claudeSignIn.tip, j.engineSetup.changeKey, j.engineSetup.useAccount, j.officeStop.changeSignIn, j.officeStop.creditKeyInfo];
    for (const w of words) {
      assert.equal(typeof w, 'string', loc);
      assert.doesNotMatch(w, /[–—]| - /, `${loc}: no dashes in ${w}`);
    }
  }
});
