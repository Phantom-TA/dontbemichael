'use strict';

/**
 * Gmail and Google Workspace connect the same way, so Add a mailbox shows one
 * tile, "Gmail or GSuite" (owner, 2026-10-26; GSuite is the owner's word for
 * Google Workspace). Mailboxes saved as Google Workspace keep working with no
 * data change: the value stays valid, and Fix opens them on the Google tile.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { PROVIDER_ORDER, PROVIDER_PRESETS, googleLabel, isGoogleProvider } = loadTs('src/shared/mailboxes.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('one Google tile; a mailbox saved as Google Workspace still has its servers', () => {
  // Value: protects=one tile for both Google products, and saved Workspace mailboxes still save, read and send; fails_when=the second tile returns or the stored value loses its preset (mail.ts saves look up presets[provider]); why_new=list change; seam=none; no_claim=a live Gmail login (hand check)
  assert.deepEqual(PROVIDER_ORDER, ['gmail', 'icloud', 'yahoo', 'zoho', 'other']);
  assert.deepEqual(PROVIDER_PRESETS['google-workspace'].imap, PROVIDER_PRESETS.gmail.imap, 'same servers');
  assert.deepEqual(PROVIDER_PRESETS['google-workspace'].smtp, PROVIDER_PRESETS.gmail.smtp);
  assert.ok(isGoogleProvider('gmail') && isGoogleProvider('google-workspace') && !isGoogleProvider('zoho'));
  assert.match(read('src/main/mail.ts'), /if \(rec\.provider !== 'gmail' && rec\.provider !== 'google-workspace'\) \{/, 'Gmail files Sent itself, for both');
});

test('rows say Gmail for gmail.com and GSuite for a company domain', () => {
  // Value: protects=a company mailbox on Google is not called Gmail; fails_when=the label ignores the address; why_new=one tile for both; seam=none; no_claim=none beyond protects
  assert.equal(googleLabel('sam@gmail.com'), 'Gmail');
  assert.equal(googleLabel(' Sam@GoogleMail.com '), 'Gmail');
  assert.equal(googleLabel('office@northwind.example'), 'GSuite');
  assert.equal(googleLabel('a@gmail.com.example.org'), 'GSuite', 'only the real domain');
  assert.match(read('src/renderer/src/components/MailboxesSettings.tsx'),
    /isGoogleProvider\(m\.provider\) \? googleLabel\(m\.address\) : PROVIDER_PRESETS\[m\.provider\]\.label/);
});

test('the dialog: the tile reads Gmail or GSuite, and Fix opens a Workspace mailbox on it', () => {
  const dialog = read('src/renderer/src/components/AddMailboxDialog.tsx');
  assert.match(dialog, /useState<MailProvider>\(fix\?\.provider === 'google-workspace' \? 'gmail' : \(fix\?\.provider \?\? 'gmail'\)\)/);
  assert.match(dialog, /p === 'gmail' \? t\('mailboxes\.googleTile'\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const m = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).mailboxes;
    assert.ok(m.googleTile.includes('Gmail') && m.googleTile.includes('GSuite'), loc);
    // Google's help is now the step cards (test/mailbox-google-steps.test.cjs).
    assert.equal(m.help['google-workspace'], undefined, `${loc}: no second Google help`);
    assert.equal(m.help.gmail, undefined, `${loc}: the paragraph gave way to step cards`);
  }
});
