'use strict';

/**
 * The owner's case study send through MailService.send (docs/designs/case-study.md,
 * eng C1, C3, OE3): a file the app made is attached, the repeat guard tells two
 * PDFs apart, an interrupted earlier send is marked so the case study can say it
 * may have gone out, and members' sends keep every result they have today.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { MailService, MailError, handleMailRequest } = loadTs('src/main/mail.ts');

const server = { host: 'h', port: 465, secure: true };
const box = (id, address, extra = {}) => ({ id, address, provider: 'other', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1, ...extra });

function setup(opts = {}) {
  const state = { sends: [], fail: opts.fail ?? null, sent: [] };
  const cfg = {
    mailboxes: [box('ceo', 'ceo@x.com'), box('old', 'old@x.com', { status: 'needs-attention', statusReason: 'Sign in again.' }), box('nopass', 'np@x.com')],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo'], send: true, sending: 'send' } } }
  };
  const imap = {
    usable: true, async connect() {}, async logout() {}, close() {},
    async list() { return [{ path: 'INBOX' }, { path: 'Sent', specialUse: '\\Sent' }]; },
    async getMailboxLock() { return { release() {} }; },
    async search() { return []; }, async *fetch() {}, async fetchOne() { return false; },
    async append(p, content) { state.sent.push(content); }
  };
  const svc = new MailService({
    getConfig: () => cfg,
    getPassword: (id) => (id === 'nopass' ? undefined : 'app-pass'),
    markStatus() {},
    createImap: () => imap,
    createSmtp: () => ({
      async sendMail(m) {
        if (state.fail) { const f = state.fail; state.fail = null; throw f; }
        state.sends.push(m);
        return { messageId: m.messageId };
      },
      close() {}
    })
  });
  return { svc, state, cfg };
}

const pdf = (text) => ({ filename: 'case-study.pdf', content: Buffer.from(text), contentType: 'application/pdf' });
const input = (file) => ({ to: 'hello@dontbemichael.com', subject: 'Case study: Harbor Bakery', body: 'Attached.', files: [file] });

test('a file the app made is attached as itself', async () => {
  const { svc, state } = setup();
  const out = await svc.send('owner:case-study', 'ceo', input(pdf('%PDF one')));
  assert.equal(out.sent, true);
  assert.equal(state.sends.length, 1);
  assert.deepEqual(state.sends[0].attachments.map((a) => [a.filename, a.contentType, a.content.toString()]), [['case-study.pdf', 'application/pdf', '%PDF one']]);
});

test('the repeat guard tells two PDFs apart, and repeats the same one', async () => {
  const { svc, state } = setup();
  await svc.send('owner:case-study', 'ceo', input(pdf('%PDF one')));
  const again = await svc.send('owner:case-study', 'ceo', input(pdf('%PDF one')));
  assert.equal(again.repeated, true, 'the same page within 10 minutes is not sent twice');
  const changed = await svc.send('owner:case-study', 'ceo', input(pdf('%PDF two')));
  assert.notEqual(changed.repeated, true, 'an edited page goes out');
  assert.equal(state.sends.length, 2);
});

test('a drop mid send is uncertain; trying again is refused as interrupted, not as a plain failure', async () => {
  const { svc, state } = setup({ fail: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
  await assert.rejects(svc.send('owner:case-study', 'ceo', input(pdf('%PDF one'))), (e) => e instanceof MailError && e.uncertain === true && e.interrupted === false);
  await assert.rejects(svc.send('owner:case-study', 'ceo', input(pdf('%PDF one'))), (e) => {
    assert.ok(e instanceof MailError);
    assert.equal(e.interrupted, true);
    assert.equal(e.uncertain, false, "members' reading of this error is unchanged");
    assert.equal(e.kind, 'refused');
    assert.match(e.message, /may already have gone out/);
    return true;
  });
  assert.equal(state.sends.length, 0);
});

test('the md-mail tool cannot attach a local file', async () => {
  const { svc, state, cfg } = setup();
  const r = await handleMailRequest(svc, { getConfig: () => cfg }, 'pam', 'send', { mailbox: 'ceo', to: 'a@b.com', subject: 's', body: 'b', files: [{ filename: 'x.pdf', content: 'AAAA', contentType: 'application/pdf' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(state.sends.length, 1);
  assert.equal(state.sends[0].attachments, undefined, 'a files field in a tool call is ignored');
});

test('every mailbox is listed for the owner; one that cannot send says why', () => {
  const { svc } = setup();
  assert.deepEqual(svc.ownerSenders(), [
    { id: 'ceo', address: 'ceo@x.com', canSend: true },
    { id: 'old', address: 'old@x.com', canSend: false, reason: 'Sign in again.' },
    { id: 'nopass', address: 'np@x.com', canSend: false, reason: 'This mailbox has no saved password. Fix it in Settings.' }
  ]);
});
