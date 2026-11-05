'use strict';

/**
 * Email reaches the team only through the mailboxes connected in the app (owner,
 * 2026-10-30). A mailbox on the Claude account is never offered, never on and
 * always denied, whatever an older install saved for it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const C = loadTs('src/shared/claudeConnectors.ts');

const list = [
  { key: 'Gmail', url: 'u1', status: 'connected' },
  { key: 'Microsoft Outlook', url: 'u2', status: 'connected' },
  { key: 'HubSpot', url: 'u3', status: 'connected' },
  { key: 'Google Calendar', url: 'u4', status: 'connected' }
];
const saved = {
  claudeConnectors: { list },
  connectorsOn: { Gmail: true, 'Microsoft Outlook': true, HubSpot: true },
  agentCapabilities: { pam: { connectors: ['Gmail', 'Microsoft Outlook', 'HubSpot'] }, kelly: { connectors: ['Gmail'] } }
};

test('a mailbox connector is told from one that only sounds like it', () => {
  // Value: protects=every mailbox a Claude account can hold is caught and nothing else is; fails_when=a provider's name slips through, or a marketing or calendar connector is hidden from the owner; why_new=owner 2026-10-30; seam=none; no_claim=connector names Anthropic adds later that do not read as mail
  for (const k of ['Gmail', ' gmail ', 'Outlook', 'Microsoft Outlook', 'Outlook Mail', 'Yahoo Mail', 'Proton Mail', 'iCloud Mail', 'Fastmail']) assert.ok(C.isMailConnectorKey(k), k);
  for (const k of ['Mailchimp', 'Google Calendar', 'Google Drive', 'HubSpot', 'Intuit QuickBooks', 'Claude Docs', 'Outlook Calendar']) assert.ok(!C.isMailConnectorKey(k), k);
});

test('an owner never sees a Claude mailbox: not listed, not new, not missing', () => {
  // Value: protects=the owner's only way to connect email is Mailboxes; fails_when=a mailbox shows in the connector list, opens the list as new, or shows as removed from the account; why_new=owner 2026-10-30; seam=none; no_claim=layout
  assert.deepEqual(C.offeredConnectors(list).map((c) => c.key), ['HubSpot', 'Google Calendar']);
  assert.deepEqual(C.offeredConnectors(null), []);
  assert.deepEqual(C.unseenKeys(list, ['HubSpot', 'Google Calendar']), [], 'nothing new to look at');
  assert.deepEqual(C.removedKeys({ ...saved, claudeConnectors: { list: [list[2]] } }), [], 'gone from the account: nothing to clear');
  for (const f of ['ClaudeConnectorsSettings', 'AddAgentModal', 'EditAgentModal']) assert.match(read(`src/renderer/src/components/${f}.tsx`), /offeredConnectors\(/, f);
  assert.doesNotMatch(read('src/renderer/src/components/triggers/ScheduleList.tsx'), /Connector/);
});

test('a saved switch or grant opens nothing, and the mailbox stays denied at start', () => {
  // Value: protects=an upgraded office with Gmail on loses it, whoever holds it; fails_when=connectorOn reads the old switch, the member keeps Gmail, or a member with another connector can load Gmail because no deny rule names it; why_new=owner 2026-10-30; seam=the two layers that hold connectors (start plan and hook, the hook in email-calendar-switch.test.cjs); no_claim=a running member, who keeps what it started with until its next start apart from the hook's refusal
  assert.equal(C.connectorOn(saved, 'Gmail'), false);
  assert.deepEqual(C.usableConnectors(saved, 'pam', false).map((c) => c.key), ['HubSpot']);
  const plan = C.spawnConnectorPlan(saved, 'pam', false);
  assert.equal(plan.strip, false);
  assert.ok(plan.deny.includes('mcp__claude_ai_Gmail'));
  assert.ok(plan.deny.includes('mcp__claude_ai_Microsoft_Outlook'));
  assert.deepEqual(C.spawnConnectorPlan(saved, 'kelly', false), { strip: true, deny: [] }, 'Gmail alone is no connector at all');
});

test('the switches refuse a mailbox, and taking an old grant away still works', () => {
  // Value: protects=no stale screen or call turns a Claude mailbox back on; fails_when=setOn or a grant accepts a mailbox, or a revoke is refused and the grant can never be cleared; why_new=owner 2026-10-30; seam=source pins (the handlers live in index.ts); no_claim=none
  const main = read('src/main/index.ts');
  const setOn = main.slice(main.indexOf("ipcMain.handle('connectors:setOn'"), main.indexOf("ipcMain.handle('connectors:setGrant'"));
  assert.match(setOn, /isMailConnectorKey\(key\)\) return \{ ok: false \};/);
  assert.match(main, /\(granted === true && isMailConnectorKey\(key\)\)\) return \{ ok: false \};/);
});

test('the Mailboxes info says email goes only through it, in every language', () => {
  // Value: protects=an owner looking for Gmail is told where it lives; fails_when=the tip still sends them to Claude connectors, or a language lacks it; why_new=owner 2026-10-30; seam=none; no_claim=wording in other languages
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const m = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).mailboxes;
    assert.ok(m.onlyHere, loc);
    assert.equal(m.gmailIsConnector, undefined, loc);
    assert.doesNotMatch(m.onlyHere, /[–—]/, loc);
  }
});

test('the update names Gmail as switched off only for an office that had it', () => {
  // Value: protects=the update card tells the truth; fails_when=Gmail is listed for an office whose old switch was off, or left out for one that used it; why_new=ship review; seam=none; no_claim=none beyond protects
  assert.ok(!C.connectorCarryOver({}, list, ['pam']).switchedOff.includes('Gmail'));
  assert.ok(C.connectorCarryOver({ mcpDefaults: { 'email-calendar': { enabled: true } } }, list, ['pam']).switchedOff.includes('Gmail'));
});
