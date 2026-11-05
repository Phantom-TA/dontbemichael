'use strict';

/**
 * Google mailbox setup as three step cards (eng review, 2026-10-26: a business
 * owner could not follow one paragraph with an address to type, and most have
 * no 2 Step Verification). Each Google page is one click away, opened on the
 * typed account; a normal Google password gets told to use an app password.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { GOOGLE_TWO_STEP_URL, GOOGLE_APP_PASSWORDS_URL, googleStepUrl } = loadTs('src/shared/mailboxes.ts');
const { classifyMailError } = loadTs('src/main/mail.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

test('each step opens Google\'s own page, on the account typed in', () => {
  // Value: protects=one click lands on the right Google page for the right account; fails_when=an address drifts, authuser is dropped or left unencoded; why_new=new buttons; seam=none; no_claim=Google keeping these addresses (hand check)
  assert.equal(GOOGLE_TWO_STEP_URL, 'https://myaccount.google.com/signinoptions/twosv');
  assert.equal(GOOGLE_APP_PASSWORDS_URL, 'https://myaccount.google.com/apppasswords');
  assert.equal(googleStepUrl(GOOGLE_APP_PASSWORDS_URL, ' sam+office@northwind.example '), 'https://myaccount.google.com/apppasswords?authuser=sam%2Boffice%40northwind.example');
  for (const notYet of ['', 'sam', 'sam@', 'sam@northwind', 'a b@c.d'])
    assert.equal(googleStepUrl(GOOGLE_TWO_STEP_URL, notYet), GOOGLE_TWO_STEP_URL, `no account for "${notYet}"`);
});

test('the dialog shows the three cards for Google, and the old paragraph only for the others', () => {
  const dialog = read('src/renderer/src/components/AddMailboxDialog.tsx');
  assert.match(dialog, /\{isGoogleProvider\(provider\) && <GoogleSteps address=\{address\} \/>\}/);
  assert.match(dialog, /\{!isGoogleProvider\(provider\) && \(\s+<div[^>]*>\s+\{t\(`mailboxes\.help\.\$\{provider\}`\)\}/);
  assert.match(dialog, /onClick=\{open\(GOOGLE_TWO_STEP_URL\)\}>\{t\('mailboxes\.google\.step1Open'\)\}/);
  assert.match(dialog, /onClick=\{open\(GOOGLE_APP_PASSWORDS_URL\)\}>\{t\('mailboxes\.google\.step2Open'\)\}/);
  assert.match(dialog, /void window\.cth\.openExternal\(googleStepUrl\(base, address\)\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const g = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).mailboxes.google;
    for (const k of ['step1Title', 'step1Line', 'step1Open', 'step2Title', 'step2Line', 'step2Open', 'step2Admin', 'step3Title', 'step3Line'])
      assert.ok(g[k], `${loc} ${k}`);
    assert.ok(g.step2Admin.includes('GSuite'), `${loc}: the GSuite admin note`);
  }
});

test('a normal Google password is told to use an app password, not that app passwords stopped working', () => {
  // Value: protects=the owner learns which password Google wants; fails_when=Google's phrase falls back into provider-blocked; why_new=bug fix (eng review D2); seam=none; no_claim=none beyond protects
  const google = classifyMailError({ responseText: '[ALERT] Application-specific password required: https://support.google.com/accounts/answer/185833 (Failure)' });
  assert.equal(google.kind, 'auth');
  assert.equal(google.message, "That is the normal Google password. Google needs an app password instead: make one on Google's App passwords page.");
  // Microsoft's real blocks keep their own message.
  for (const ms of ['Please log in via your web browser', 'Basic authentication is disabled', 'WebLoginRequired: web login required'])
    assert.equal(classifyMailError({ responseText: ms }).kind, 'provider-blocked', ms);
});
