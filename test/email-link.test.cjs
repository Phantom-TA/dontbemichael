'use strict';

/**
 * The email link a mail read gives and a card's chip opens
 * (docs/designs/original-email-view.md): its format and parser, the Message-ID
 * guard (R8), the label, and the Open in Gmail address (E2).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { emailHref, parseEmailHref, emailLinkFor, emailLabel, emailTabId, isSafeMessageId, gmailMessageUrl, senderName, EMAIL_IPC } = loadTs('src/shared/emailLink.ts');

test('a link round trips its mailbox and Message-ID', () => {
  const ref = { mailbox: 'sales', messageId: '<CAF+x.y=z@mail.example.com>' };
  const href = emailHref(ref);
  assert.match(href, /^email:sales\//);
  assert.deepEqual(parseEmailHref(href), ref);
  assert.deepEqual(parseEmailHref(href.replace('email:', 'EMAIL:')), ref, 'the scheme is case blind');
});

test('anything that is not one email link is refused, never guessed', () => {
  for (const bad of ['', 'email:', 'email:sales', 'email:/x', 'email:Sales/%3Ca%40b%3E', 'email:sales/%E0%A4%A', 'mailto:a@b.com', 'email:sales/a@b', 'email:../x/%3Ca%40b%3E']) {
    assert.equal(parseEmailHref(bad), null, bad);
  }
});

test('a Message-ID the searches cannot carry gets no link (R8)', () => {
  assert.equal(isSafeMessageId('<a@b>'), true);
  for (const id of ['a@b', '<a b@c>', '<"a"@b>', '<a\\b@c>', '<a@b>\r\nX: y', '<ab>', `<${'a'.repeat(995)}@b>`]) {
    assert.equal(isSafeMessageId(id), false, JSON.stringify(id.slice(0, 20)));
    assert.equal(emailHref({ mailbox: 'sales', messageId: id }), null);
  }
  assert.equal(emailLinkFor('sales', { from: 'Dana <d@x.com>', date: '2026-10-27T09:14:00Z', messageId: '' }), null, 'no Message-ID, no link');
});

test('the link a read gives names the sender and a short date', () => {
  const link = emailLinkFor('sales', { from: '"Dana Ortiz" <dana@northwind.example>', date: '2026-10-27T12:00:00Z', messageId: '<m1@northwind.example>' });
  assert.match(link, /^\[Dana Ortiz, 2[67] Oct\]\(email:sales\/%3Cm1%40northwind\.example%3E\)$/);
  assert.equal(senderName('dana@northwind.example'), 'dana@northwind.example');
  assert.equal(senderName('<dana@northwind.example>'), 'dana@northwind.example');
});

test('a label never breaks the markdown link it sits in, and is cut at 60 units', () => {
  const label = emailLabel('"Evil] (x) [y\nz" <e@x.com>', '');
  assert.ok(!/[[\]\r\n]/.test(label), label);
  const long = emailLabel(`${'😀'.repeat(40)} <e@x.com>`, '');
  assert.ok(long.length <= 60);
  assert.ok(!/[\uD800-\uDBFF]$/.test(long), 'never ends on half an emoji');
  assert.equal(emailLabel('', ''), 'Email');
});

test('two spellings of one email share a tab', () => {
  assert.equal(emailTabId({ mailbox: 'sales', messageId: '<AbC@x>' }), emailTabId({ mailbox: 'sales', messageId: '<abc@x>' }));
});

test('Open in Gmail searches for that exact email in that account (E2)', () => {
  const url = gmailMessageUrl('ops@business.example', '<m1@x.example>');
  assert.equal(url, 'https://mail.google.com/mail/?authuser=ops%40business.example#search/rfc822msgid%3A%3Cm1%40x.example%3E');
});

test('the preload uses the same channel names main answers (R9)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const preload = fs.readFileSync(path.join(__dirname, '..', 'src/preload/index.ts'), 'utf8');
  for (const ch of Object.values(EMAIL_IPC)) assert.ok(preload.includes(`ipcRenderer.invoke('${ch}'`), ch);
});
