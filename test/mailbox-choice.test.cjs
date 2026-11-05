'use strict';

/**
 * Giving a member a mailbox (owner, 2026-10-30, docs/designs/mailbox-choice.md):
 * new owners could not tell "Watch the inbox" from "Send only". The choice now
 * says what the member will do, on the screen, and Only send is greyed until
 * someone reads the inbox.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const tab = read('src/renderer/src/components/CapabilitiesTab.tsx');
const panel = tab.slice(tab.indexOf(') : adding ? ('), tab.indexOf('Nothing left to add'));

test('each choice says what the member will do, on the screen, with no info icon', () => {
  // Value: protects=a new owner reads both meanings without hovering; fails_when=a line moves back behind the icon, the question goes missing from the screen, or a greyed reason replaces the wrong row; why_new=owner 2026-10-30, D2; seam=source pins (no render harness for the Access tab); no_claim=layout
  assert.doesNotMatch(panel, /InfoTip/);
  assert.match(panel, /<div aria-hidden="true" style=\{h13\}>\{t\('capabilities\.addHow', \{ name \}\)\}<\/div>/);
  assert.match(panel, /: addHolder \? t\('capabilities\.addWatchMoves', \{ from: nameOf\(addHolder\), name \}\)\s*: t\('capabilities\.addReadsDesc', \{ name \}\)/);
  assert.match(panel, /: addSendReady \? t\('capabilities\.addSendsDesc', \{ name, holder: nameOf\(addHolder!\) \}\)\s*: t\('capabilities\.addSendOnlyNobody'\)/);
  assert.match(panel, /t\('capabilities\.addIt', \{ name \}\)/);
});

test('Only send waits for a reader, and a saved grant is left alone', () => {
  // Value: protects=a new owner cannot give a member an address whose email would only wait; fails_when=Only send is offered on a mailbox nobody reads, an archived holder counts as a reader, the first choice lands on a greyed row, or the rule starts changing saved grants; why_new=owner 2026-10-30, D2; seam=source pins; no_claim=the paused note on a mailbox that later loses its reader (send-only-grants.test.cjs)
  assert.match(tab, /const readBySomeone = \(id: string\): boolean => \{ const h = holderOf\(id\); return !!h && reads\(h\); \};/);
  assert.match(panel, /disabled: !canSendOnly \|\| !addSendReady,/);
  assert.match(tab, /setAddKind\(!id \? '' : canSendOnly && readBySomeone\(id\) \? 'send' : canWatch \? 'watch' : ''\);/);
  assert.match(tab, /const grantPausedNow = /, 'the paused note stays');
});

test('the only mailbox is chosen for the owner', () => {
  // Value: protects=a one mailbox office sees the question as soon as the panel opens; fails_when=the panel opens empty with one mailbox, or picks for the owner when there are several; why_new=owner 2026-10-30, D3; seam=source pins; no_claim=none
  assert.match(tab, /if \(addable\.length === 1\) pickAdd\(addable\[0\]\.id\);/);
  assert.match(tab, /<button type="button" onClick=\{openAdd\}/);
});

test('a greyed row dims its name, never the reason the owner has to read', () => {
  // Value: protects=the reason stays readable; fails_when=the whole row dims again and the reason falls below 4.5:1; why_new=design review pass 5; seam=source pin; no_claim=colours in every theme
  const rows = tab.slice(tab.indexOf('if (o.disabled) {'), tab.indexOf('return (\n          <button'));
  assert.match(rows, /fontWeight: 500, opacity: 0\.55 \}\}>\{o\.label\}/);
  assert.match(rows, /\{o\.desc && <span style=\{\{ display: 'block', \.\.\.hint \}\}>\{o\.desc\}<\/span>\}/);
  assert.doesNotMatch(rows, /row\.borderTop, opacity/);
});

test('one word for one idea in every language, and no dashes', () => {
  // Value: protects=the choice and the lines after it use the same words; fails_when=a language lacks a string, or watches or checks come back in English; why_new=owner 2026-10-30, D1; seam=none; no_claim=quality of the Chinese and Arabic
  const keys = ['addMailboxUse', 'addIt', 'addHow', 'addWatch', 'addSendOnly', 'addReadsDesc', 'addSendsDesc', 'addSendOnlyNobody', 'addWatchMoves', 'addWatchTaken', 'addSendOnlyTaken', 'addMailboxBothUsed', 'inboxWatches', 'inboxSendOnly', 'inboxNobody', 'sendOnlyPaused', 'removeWatchedSure', 'moveMailbox', 'sendOnlyUse'];
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const c = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).capabilities;
    assert.equal(c.addMailboxInfo, undefined, loc);
    for (const k of keys) {
      assert.equal(typeof c[k], 'string', `${loc} ${k}`);
      assert.doesNotMatch(c[k], /[–—]| - /, `${loc} ${k}`);
    }
    assert.match(c.addSendsDesc, /\{\{name\}\}[\s\S]*\{\{holder\}\}|\{\{holder\}\}[\s\S]*\{\{name\}\}/, loc);
  }
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).capabilities;
  for (const k of keys) assert.doesNotMatch(en[k], /\bwatch|\bcheck/i, k);
});

test('the approved mockup still shows the words the panel ships', () => {
  // Value: protects=docs/designs/mailbox-choice-ux.html stays a true record of the design; fails_when=the choice is renamed without the mockup; why_new=owner 2026-10-30, D2; seam=none; no_claim=the mockup's layout
  const mock = read('docs/designs/mailbox-choice-ux.html');
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).capabilities;
  assert.ok(mock.includes(en.addWatch) && mock.includes(en.addSendOnly));
});


test('a mailbox taken over from a teammate starts on Send on approval too', () => {
  // Value: protects=every way a member gets a mailbox starts the same; fails_when=the move keeps an old Draft only; why_new=ship review; seam=source pin; no_claim=none beyond protects
  assert.match(tab, /save\(\{ \.\.\.email, enabled: true, mailboxes: \[moving\], send: false, sending: 'approval' \}, true\)/);
});
