'use strict';

/**
 * One agent per mailbox, in the Capabilities tab (owner, 2026-09-27). Main
 * refuses a held mailbox (mail-edges.test.cjs); this checks the tab asks the
 * owner before moving it, marks held mailboxes in the list, and that its
 * strings exist in every language without dashes. Plus mailboxHolder itself.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');
const { mailboxHolder } = loadTs('src/shared/mailboxes.ts');

test('mailboxHolder finds the agent with email on and that mailbox picked, except the asker', () => {
  const caps = {
    pam: { email: { enabled: true, mailboxes: ['sales'], send: true } },
    off: { email: { enabled: false, mailboxes: ['ceo'], send: false } },
    none: {}
  };
  assert.equal(mailboxHolder(caps, 'sales'), 'pam');
  assert.equal(mailboxHolder(caps, 'sales', 'pam'), undefined, 'not a clash with herself');
  assert.equal(mailboxHolder(caps, 'ceo'), undefined, 'email off holds nothing');
  assert.equal(mailboxHolder(caps, 'missing'), undefined);
  assert.equal(mailboxHolder(undefined, 'sales'), undefined);
});

test('the tab asks before moving a held mailbox and marks who holds each one', () => {
  const tab = read('src/renderer/src/components/CapabilitiesTab.tsx');
  assert.match(tab, /if \(holderOf\(id\)\) \{ setMoving\(id\); return; \}/, 'picking a held mailbox asks first');
  assert.match(tab, /if \(!res\.ok && res\.heldBy && next\.mailboxes\[0\]\) \{ setMoving\(next\.mailboxes\[0\]\); return; \}/, 'a race with another save asks too');
  assert.match(tab, /save\(\{ \.\.\.email, enabled: true, mailboxes: \[moving\], send: false, sending: 'approval' \}, true\)/, 'Move it confirms the move');
  assert.match(tab, /onClick=\{\(\) => setMoving\(null\)\}>\{t\('capabilities\.keepIt'\)\}/);
  assert.match(tab, /holder \? t\('capabilities\.heldBy', \{ name: nameOf\(holder\) \}\)/);
  assert.match(tab, /mailboxHolder\(config\.agentCapabilities, id, agent\.id\)/);
});

test('the move strings exist in every language, without dashes', () => {
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const c = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).capabilities;
    for (const k of ['heldBy', 'moveMailbox', 'moveMailboxFree', 'moveIt', 'keepIt']) {
      assert.equal(typeof c[k], 'string', `${loc}: capabilities.${k}`);
      assert.doesNotMatch(c[k], /[–—]| - /, `${loc}: capabilities.${k} has a dash`);
    }
    for (const v of ['{{from}}', '{{address}}', '{{to}}']) assert.ok(c.moveMailbox.includes(v), `${loc}: moveMailbox names ${v}`);
  }
});
