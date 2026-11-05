'use strict';

/**
 * The email chip and its tab in the renderer, and the agent rule that carries
 * the link (docs/designs/original-email-view.md, C1, E1, DD1 to DD8).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const { placeUrlTransform } = loadTs('src/renderer/src/markdown/placeUrl.ts');
const { openTab, retitleTab, closeTab } = loadTs('src/renderer/src/store/fileTabs.ts');
const { emailTabId } = loadTs('src/shared/emailLink.ts');

test('card markdown lets an email link through and still drops script links', () => {
  assert.equal(placeUrlTransform('email:sales/%3Cm1%40x%3E'), 'email:sales/%3Cm1%40x%3E');
  assert.equal(placeUrlTransform('EMAIL:sales/%3Cm1%40x%3E'), 'EMAIL:sales/%3Cm1%40x%3E');
  assert.equal(placeUrlTransform('dbm:settings/agents'), 'dbm:settings/agents');
  assert.equal(placeUrlTransform('javascript:alert(1)'), '');
});

test('an email link is a chip in a card and only words in a document', () => {
  const md = read('src/renderer/src/markdown/MarkdownPreview.tsx');
  assert.match(md, /const email = card \? parseEmailHref\(h\) : null;\s*return email \? <EmailChip email=\{email\} words=\{hastText\(node\)\}>\{children\}<\/EmailChip> : <>\{children\}<\/>;/);
  const chip = read('src/renderer/src/markdown/EmailChip.tsx');
  assert.match(chip, /className="cth-file-chip"/, 'the same chip as files and places (DD3)');
  assert.match(chip, /<Icon name="mail"/);
  assert.match(chip, /aria-label=\{t\('emailTab\.openEmail', \{ words \}\)\}/);
});

test('an email opens one tab, which takes its subject once read', () => {
  const ref = { mailbox: 'sales', messageId: '<m1@x>' };
  const tab = { id: emailTabId(ref), title: 'Dana Ortiz, 27 Oct', kind: 'email', email: ref, who: {}, openedAt: 1 };
  let s = openTab({ fileTabs: [], activeFileTab: null }, tab);
  s = openTab(s, { ...tab, openedAt: 2 });
  assert.equal(s.fileTabs.length, 1);
  s = retitleTab(s, tab.id, 'Re: Free scoping review');
  assert.equal(s.fileTabs[0].title, 'Re: Free scoping review');
  assert.equal(retitleTab(s, 'nope', 'x'), s);
  assert.equal(closeTab(s, tab.id).fileTabs.length, 0);
  const view = read('src/renderer/src/components/FileTabView.tsx');
  assert.match(view, /if \(tab\.email\) return <EmailTabView key=\{tab\.id\} tab=\{tab\} \/>;/);
});

test('the email tab: subject leads, white sheet, pictures line, focus, cancel on close', () => {
  const tab = read('src/renderer/src/components/EmailTabView.tsx');
  assert.match(tab, /background: '#FFFFFF'/, 'white sheet in both themes (DD2)');
  assert.match(tab, /role="status"/, 'the pictures line is announced (DD7)');
  assert.match(tab, /title\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(tab, /return \(\) => \{ live = false; void window\.cth\.mailOriginalCancel\(href\); \};/);
  assert.match(tab, /className="cth-email-rows"/);
  assert.match(read('src/renderer/src/design/global.css'), /@media \(max-width: 560px\) \{ \.cth-email-rows \{ grid-template-columns: 1fr !important; \} \}/);
});

test('every state the tab can show has its words, in every language, with no dashes', () => {
  const en = JSON.parse(read('src/renderer/src/i18n/locales/en.json')).emailTab;
  const ar = JSON.parse(read('src/renderer/src/i18n/locales/ar.json')).emailTab;
  const zh = JSON.parse(read('src/renderer/src/i18n/locales/zh-CN.json')).emailTab;
  for (const r of ['broken', 'mailbox', 'message', 'auth', 'blocked', 'network', 'unknown']) {
    assert.ok(en.failed[r] && ar.failed[r] && zh.failed[r], r);
  }
  const keys = (o) => Object.entries(o).flatMap(([k, v]) => (typeof v === 'object' ? keys(v).map((x) => `${k}.${x}`) : [k])).sort();
  assert.deepEqual(keys(ar), keys(en));
  assert.deepEqual(keys(zh), keys(en));
  const words = JSON.stringify(en);
  assert.ok(!/[–—]| - /.test(words), 'no dashes in the copy');
});

test('a reply card shows the email it answers', () => {
  const cards = read('src/renderer/src/components/MailProposalCards.tsx');
  assert.match(cards, /const replyHref = p\.thread\?\.inReplyTo \? emailHref\(\{ mailbox: p\.mailbox, messageId: p\.thread\.inReplyTo \}\) : null;/);
  assert.match(cards, /\{t\('emailTab\.replyingTo'\)\}\s*<EmailChip email=\{replying\} words=\{p\.to\}>/);
});

test('members and Michael carry an email\'s link into the filing and the ask', () => {
  const hive = read('src/main/hive.ts');
  assert.match(hive, /When a filing is built on an email you read .* put that email's link from your mail read \(its "link"/);
  assert.match(hive, /When the ask is built on an email, keep the email link the team member gave \(an email: link\) as written/);
  assert.match(hive, /an ask built on an email keeps that email's link/);
  assert.match(hive, /A filing built on an email carries that email's link from the mail read/);
  assert.match(read('resources/md-mail-mcp.cjs'), /Its "link" names this email for the owner: put it, as written, in any filing built on this email\./);
  assert.match(read('src/main/mail.ts'), /const link = emailLinkFor\(mailbox!, msg\);\s*return \{ status: 200, body: link \? \{ \.\.\.msg, link \} : msg \};/);
});
