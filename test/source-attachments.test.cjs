'use strict';

/**
 * See the original a document was made from (docs/designs/source-attachments.md,
 * owner 2026-11-05): team members' documents link their source, a file tab
 * makes those links open, and the owner opens an email's attachments from its
 * tab, held to save_attachment's checks, in the app's own folder.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const { MailService } = loadTs('src/main/mail.ts');
const { attachmentKind } = loadTs('src/shared/attachmentKind.ts');

const server = { host: 'h', port: 993, secure: true };
const ID = '<m1@northwind.example>';
const PDF = Buffer.from('%PDF-1.4\n% the workflow document\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const b64 = (b) => b.toString('base64');
const RAW = Buffer.from([
  'From: "Ellah Foster" <ellah@gammatile.example>', 'To: sales@business.example', 'Subject: Workflow document',
  `Message-ID: ${ID}`, 'Date: Wed, 28 Oct 2026 09:14:00 +0000', 'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="b1"', '',
  '--b1', 'Content-Type: multipart/related; boundary="b2"', '',
  '--b2', 'Content-Type: text/html; charset=utf-8', '', '<p>Here it is <img src="cid:logo@x"></p>',
  '--b2', 'Content-Type: image/png', 'Content-ID: <logo@x>', 'Content-Disposition: inline', 'Content-Transfer-Encoding: base64', '', b64(PNG),
  '--b2--',
  '--b1', 'Content-Type: application/pdf; name="Workflow.pdf"', 'Content-Disposition: attachment; filename="Workflow.pdf"', 'Content-Transfer-Encoding: base64', '', b64(PDF),
  '--b1', 'Content-Type: text/plain; name="run.sh"', 'Content-Disposition: attachment; filename="run.sh"', '', '#!/bin/sh', 'echo hi',
  '--b1--', ''
].join('\r\n'));

function fakeService() {
  const config = { mailboxes: [{ id: 'ops', address: 'sales@business.example', provider: 'other', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 }] };
  const locks = [];
  const deps = {
    getConfig: () => config, getPassword: () => 'pw', markStatus: () => {},
    createImap: () => {
      let current = null;
      return {
        async connect() {}, async logout() {}, close() {},
        async list() { return [{ path: 'INBOX' }, { path: 'Archive', specialUse: '\\Archive' }]; },
        async getMailboxLock(p, opts) { current = p; locks.push({ path: p, readOnly: opts?.readOnly === true }); return { release() {} }; },
        async search(q) { return current === 'Archive' && q.header?.['message-id'] === ID ? [7] : []; },
        async fetchOne(uid, q) {
          if (String(uid) !== '7') return false;
          if (q.source) return { uid, source: RAW, flags: new Set() };
          return { uid, size: RAW.length };
        },
        fetch() { throw new Error('not used'); },
        async append() { throw new Error('never appends'); },
        async messageFlagsAdd() { throw new Error('never marks'); },
        async messageMove() { throw new Error('never moves'); }
      };
    }
  };
  return { svc: new MailService(deps), locks };
}

test('the owner gets exactly the attachment the email tab lists at that place', async () => {
  // Value: protects=the click opens the file the owner saw, not a neighbour or the inline picture, read only; fails_when=the listing and the open count attachments differently, an index past the list opens anything, or a folder opens writable; why_new=owner 2026-11-05; seam=fake IMAP with a real multipart email
  const { svc, locks } = fakeService();
  const listed = (await svc.original('ops', ID)).attachments.map((a) => a.name);
  assert.deepEqual(listed, ['Workflow.pdf', 'run.sh'], 'the inline picture the body shows is not listed');
  const pdf = await svc.originalAttachment('ops', ID, 0);
  assert.equal(pdf.name, 'Workflow.pdf');
  assert.ok(pdf.bytes.equals(PDF));
  assert.equal(attachmentKind(pdf.bytes, pdf.name).id, 'pdf');
  const script = await svc.originalAttachment('ops', ID, 1);
  assert.equal(script.name, 'run.sh');
  assert.equal(attachmentKind(script.bytes, script.name), null, 'a script is refused by the kind check');
  await assert.rejects(svc.originalAttachment('ops', ID, 2), /attachment/);
  await assert.rejects(svc.originalAttachment('ops', ID, -1), /attachment/);
  assert.ok(locks.every((l) => l.readOnly), 'every folder opened read only');
});

test('a large email opens the attachment the tab lists at that place, part by part, and refuses one too big', async () => {
  // Value: protects=the owner opens the file they clicked on an email over 25 MB, and an oversize file is refused before anything is written; fails_when=the part by part index drifts from the tab's list, or the size cap is dropped; why_new=coverage audit, 2026-11-05 (only the whole parse was tested); seam=fake IMAP with a body structure and downloads; no_claim=a real server's part numbering
  const attached = (part, name, size, extra = {}) => ({ part, type: 'application/octet-stream', disposition: 'attachment', dispositionParameters: { filename: name }, size, ...extra });
  const nodes = [{ part: '1', type: 'text/plain', size: 20 }, attached('2', 'Workflow.pdf', PDF.length), attached('3', 'Huge.zip', 30 * 1024 * 1024)];
  const config = { mailboxes: [{ id: 'ops', address: 'sales@business.example', provider: 'other', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 }] };
  const downloads = [];
  const svc = new MailService({
    getConfig: () => config, getPassword: () => 'pw', markStatus: () => {},
    createImap: () => {
      let current = null;
      return {
        async connect() {}, async logout() {}, close() {},
        async list() { return [{ path: 'INBOX' }]; },
        async getMailboxLock(p) { current = p; return { release() {} }; },
        async search(q) { return current === 'INBOX' && q.header?.['message-id'] === ID ? [7] : []; },
        async fetchOne(uid) { return String(uid) === '7' ? { uid, size: 40 * 1024 * 1024, envelope: { subject: 'Big' }, bodyStructure: { type: 'multipart/mixed', childNodes: nodes } } : false; },
        async download(_uid, part) { downloads.push(part); return { content: (async function* () { yield part === '2' ? PDF : Buffer.from('x'); })() }; },
        fetch() { throw new Error('not used'); }
      };
    }
  });
  const pdf = await svc.originalAttachment('ops', ID, 0);
  assert.equal(pdf.name, 'Workflow.pdf');
  assert.ok(pdf.bytes.equals(PDF));
  await assert.rejects(svc.originalAttachment('ops', ID, 1), /over \d+ MB/, 'refused before any download');
  await assert.rejects(svc.originalAttachment('ops', ID, 2), /attachment/);
  assert.deepEqual(downloads, ['2'], 'only the file asked for was downloaded');
});

test('main opens it in its own app from the app\'s own folder, checked and marked, and clears the folder at quit', () => {
  // Value: protects=E3 to E5: only kinds the office takes in, the save_attachment write and outside mark before it opens, never in the office, gone at quit; fails_when=the kind check, the mark, the folder or the cleanup is dropped; why_new=owner 2026-11-05; seam=source pins (Electron's shell is not run in tests)
  const main = read('src/main/index.ts');
  const at = main.indexOf('ipcMain.handle(EMAIL_IPC.openAttachment');
  assert.ok(at > 0);
  const body = main.slice(at, main.indexOf('\n});', at));
  assert.match(body, /!fromAppPage\(evt\)/, 'owner only, from the app page');
  assert.match(body, /const kind = attachmentKind\(got\.bytes, got\.name\);\s*\/\/[^\n]*\n\s*if \(!kind\)/);
  assert.match(body, /saveAttachmentFile\(\{ folder: openedAttachmentsDir\(\), name: got\.name, ending: kind\.ending, bytes: got\.bytes \}, markFromOutsideNow\)/);
  // Read only before it opens: the folder is cleared at quit, so a change
  // saved there would be lost (ship review, 2026-11-05).
  assert.match(body, /chmodSync\(path, 0o444\);\s*const opened = await shell\.openPath\(path\);/);
  assert.match(main, /const openedAttachmentsDir = \(\): string => join\(app\.getPath\('userData'\), 'opened-attachments'\);/);
  assert.match(main, /app\.on\('will-quit', \(\) => \{ try \{ rmSync\(openedAttachmentsDir\(\), \{ recursive: true, force: true \}\); \} catch/);
  assert.match(read('src/main/attachmentSave.ts'), /export function markFromOutsideNow\(path: string\): void \{\s*if \(process\.platform === 'darwin'\) \{[\s\S]{0,200}execFileSync\('xattr'/);
});

test('the email tab\'s attachments are buttons that say why one did not open', () => {
  // Value: protects=D1 B on the owner's side; fails_when=a row stops opening or a refusal says nothing; why_new=owner 2026-11-05; seam=source pin plus locales
  const tab = read('src/renderer/src/components/EmailTabView.tsx');
  assert.match(tab, /void window\.cth\.mailOpenAttachment\(href, i\)/);
  assert.match(tab, /onClick=\{\(\) => openAttachment\(i\)\}/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const t = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).emailTab;
    for (const k of ['attachmentOpen', 'attachmentOpening', 'attachmentKind', 'attachmentTooBig', 'attachmentFailed']) {
      assert.ok(t[k], `${loc} emailTab.${k}`);
      assert.doesNotMatch(t[k], /[–—]/, `${loc} emailTab.${k} has no dash`);
    }
  }
});

test('a document in a file tab shows full paths as chips, and relative links stay inert', () => {
  // Value: protects=D1 A (the Source line's original opens from the document) and the 2026-10-10 answer that links between documents stay inert; fails_when=the file tab drops the chips or starts opening relative links; why_new=owner 2026-11-05; seam=source pin
  const view = read('src/renderer/src/components/FileTabView.tsx');
  assert.match(view, /<FileText source=\{read\.text \?\? ''\} who=\{tab\.who\} variant="document" root=\{tab\.id\.slice\(0, slash\)\} baseRel=\{tab\.id\.slice\(slash \+ 1\)\} \/>/);
  assert.doesNotMatch(view, /onOpenMarkdownLink/);
  // The file tab asks for the display read, so a Word file's own brackets can't form links there.
  const main = read('src/main/index.ts');
  assert.match(main, /readAskFile\(p, askFileRoots\(who\), \(path\) => documentText\(path, undefined, true\)\)/);
  assert.match(read('src/main/docTextProcess.ts'), /\[\.\.\.launch\.args, '--json', \.\.\.\(display \? \['--display'\] : \[\]\), srcPath\]/);
});

test('team members link a document\'s source: the original by full path, the email by its link', () => {
  // Value: protects=the one agent behavior change (E1); fails_when=the rule is dropped from members' instructions or picks up a dash; why_new=owner 2026-11-05; seam=source pin of the prompt text
  const hive = read('src/main/hive.ts');
  const rule = 'When you write a document from an email, its attachment or another file, give it a Source line that names the original by its full path in backticks (the file you saved from the email, or the file you read) and the email by its link from your mail read, as written, like [Dana Ortiz, 27 Oct](email:...), so the owner can open the original in one click.';
  assert.ok(hive.includes(rule));
  assert.doesNotMatch(rule, /[–—]| - /);
});
