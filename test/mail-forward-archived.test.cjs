'use strict';

/**
 * An approved forward or attachment after inbox zero (send-on-approval.md).
 * A proposal names what it forwards or attaches by an inbox id, and the email
 * is often archived before the owner says yes; the inbox id then names
 * nothing. The proposal keeps each email's Message-ID, and the send finds it
 * by that. A real MailService and real approvals on a fake IMAP server; this
 * file runs under plain node (send-only-grants.test.cjs, where the reply side
 * of this lives, needs the Electron binary).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { MailService, handleMailRequest } = loadTs('src/main/mail.ts');
const { MailApprovals } = loadTs('src/main/mailApprovals.ts');

const server = { host: 'h', port: 993, secure: true };
const box = (id, address) => ({ id, address, provider: 'gmail', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 });
const cfg = {
  mailboxes: [box('ceo', 'ceo@x.com')],
  agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['ceo'], send: false, sending: 'approval' } } }
};

const raw = (subject, id, attachment = '') => Buffer.from(attachment
  ? `From: a@b.com\r\nTo: ceo@x.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x.com>\r\nDate: Fri, 25 Sep 2026 10:00:00 +0000\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="b"\r\n\r\n--b\r\nContent-Type: text/plain\r\n\r\nbody ${id}\r\n--b\r\nContent-Type: text/plain; name="${attachment}"\r\nContent-Disposition: attachment; filename="${attachment}"\r\n\r\nthe ${attachment} itself\r\n--b--\r\n`
  : `From: a@b.com\r\nTo: ceo@x.com\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x.com>\r\nDate: Fri, 25 Sep 2026 10:00:00 +0000\r\n\r\nbody ${id}\r\n`);
const headersOf = (source) => source.toString().split('\r\n\r\n')[0] + '\r\n\r\n';

/** Gmail's folders; a header search matches as IMAP does (a substring). */
function fakeImap(state) {
  let folder = 'INBOX';
  const here = () => state.folders[folder] ?? [];
  return {
    usable: true,
    async connect() {
      if (state.down) throw Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' });
    },
    async logout() {},
    close() {},
    async list() { return [{ path: 'INBOX' }, { path: 'Drafts', specialUse: '\\Drafts' }, { path: 'Sent', specialUse: '\\Sent' }, { path: '[Gmail]/All Mail', specialUse: '\\All' }]; },
    async getMailboxLock(p) { folder = p; return { release() {} }; },
    async search(q) {
      const want = q.header?.['message-id'];
      return here().filter((m) => !want || headersOf(m.source).toLowerCase().includes(String(want).toLowerCase())).map((m) => m.uid);
    },
    async *fetch() {},
    async fetchOne(uid, q) {
      const m = here().find((x) => String(x.uid) === String(uid));
      if (!m) return false;
      return q.headers ? { headers: headersOf(m.source) } : { source: m.source, size: m.source.length, flags: new Set() };
    },
    async append(p, content) { (state.folders[p] ??= []).push({ uid: 100 + state.folders[p].length, source: content }); }
  };
}

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-forward-archived-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = {
    folders: {
      INBOX: [{ uid: 2, source: raw('Invoice 42', 'm2') }, { uid: 3, source: raw('Receipts', 'm3', 'receipt.txt') }],
      Drafts: [], Sent: [], '[Gmail]/All Mail': []
    },
    sends: []
  };
  const approvals = new MailApprovals({
    path: path.join(dir, 'mail-proposals.json'),
    send: () => {}, remember: () => {}, toast: () => {}, agentName: (id) => id, godId: () => 'god', changed: () => {}
  });
  const svc = new MailService({
    getConfig: () => cfg,
    getPassword: () => 'app-pass',
    markStatus() {},
    createImap: () => fakeImap(state),
    createSmtp: () => ({ async sendMail(m) { state.sends.push(m); return { messageId: m.messageId }; }, close() {} })
  });
  const call = (agent, op, body) => handleMailRequest(svc, { getConfig: () => cfg, proposals: approvals }, agent, op, body);
  /** Inbox zero: the email leaves the inbox for All Mail under a new uid. */
  const archive = (uid, newUid) => {
    const m = state.folders.INBOX.find((x) => x.uid === uid);
    state.folders.INBOX = state.folders.INBOX.filter((x) => x !== m);
    state.folders['[Gmail]/All Mail'].push({ uid: newUid, source: m.source });
  };
  return { state, approvals, call, archive };
}

test('a proposal keeps the Message-ID of the email it forwards and of each it attaches from', async (t) => {
  // Value: protects=the card still knows which email it forwards once the inbox id is gone; fails_when=only the inbox id is kept on the card; why_new=PR 592 kept this for reply_to only; seam=none
  const { call, approvals } = setup(t);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Fwd: Invoice 42', body: 'Please file this.', forward: { mailbox: 'ceo', id: '2' }, attach_from: [{ mailbox: 'ceo', id: '3' }] });
  assert.equal(p.status, 200);
  const card = approvals.get(p.body.proposal);
  assert.deepEqual(card.forward, { mailbox: 'ceo', id: '2', messageId: '<m2@x.com>' });
  assert.deepEqual(card.attachFrom, [{ mailbox: 'ceo', id: '3', messageId: '<m3@x.com>' }]);
});

test('an agent cannot name a Message-ID itself; only the app keeps one', async (t) => {
  // Value: protects=a forward is always the email its id named; fails_when=a messageId from the call is kept and later fetched instead; why_new=refs now carry one; seam=none
  const { call, approvals, state } = setup(t);
  state.down = true; // nothing can be read, so nothing is kept but the call's own id
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Fwd: Invoice 42', body: 'Please file this.', forward: { mailbox: 'ceo', id: '2', messageId: '<m3@x.com>' } });
  assert.equal(p.status, 200, 'a server out of reach does not hold the card up');
  assert.deepEqual(approvals.get(p.body.proposal).forward, { mailbox: 'ceo', id: '2' });
});

test('an approved forward and attachment still go out after their emails are archived', async (t) => {
  // Value: protects=the accountant gets the invoice the owner approved forwarding; fails_when=the approved send fetches by the inbox id alone, which archiving leaves naming nothing; why_new=every approved forward of an archived email failed with not-found, every retry too, and Michael was asked about it an hour later; seam=none
  const { call, approvals, state, archive } = setup(t);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Fwd: Invoice 42', body: 'Please file this.', forward: { mailbox: 'ceo', id: '2' }, attach_from: [{ mailbox: 'ceo', id: '3' }] });
  archive(2, 900);
  archive(3, 901);
  approvals.decide(p.body.proposal, 'approve', {}, '');
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: p.body.proposal });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(state.sends.length, 1);
  const [fwd, receipt] = state.sends[0].attachments;
  assert.equal(fwd.filename, 'forwarded-message.eml');
  assert.match(fwd.content.toString(), /Message-ID: <m2@x\.com>/);
  assert.equal(receipt.filename, 'receipt.txt');
  assert.equal(receipt.content.toString().trim(), 'the receipt.txt itself');
  assert.equal(approvals.get(p.body.proposal).state, 'sent');
});

test('a forward whose email is gone everywhere is still refused, and never sends an email that only mentions it', async (t) => {
  // Value: protects=a forward is always the email the agent named; fails_when=a header search hit is used without checking its own Message-ID (a reply in Sent cites the original in References); why_new=the send now searches by Message-ID; seam=fake search matches any header, as a lax server might
  const { call, approvals, state } = setup(t);
  const p = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Fwd: Invoice 42', body: 'Please file this.', forward: { mailbox: 'ceo', id: '2' } });
  state.folders.INBOX = state.folders.INBOX.filter((m) => m.uid !== 2); // deleted, not archived
  state.folders.Sent.push({ uid: 50, source: Buffer.from('From: ceo@x.com\r\nTo: a@b.com\r\nSubject: Re: Invoice 42\r\nMessage-ID: <reply@x.com>\r\nReferences: <m2@x.com>\r\n\r\nThanks\r\n') });
  approvals.decide(p.body.proposal, 'approve', {}, '');
  const sent = await call('pam', 'send', { mailbox: 'ceo', proposal: p.body.proposal });
  assert.equal(sent.status, 404);
  assert.match(sent.body.error, /No message with id 2 in the inbox/);
  assert.equal(state.sends.length, 0);
});

test('a forward or attachment of an email that is gone is refused when proposed, not after the owner approves', async (t) => {
  // Value: protects=the owner never approves an email that can't go out; fails_when=propose files a card for a forward or attach_from id that names nothing; why_new=PR 592 refused this for reply_to only; seam=none
  const { call, approvals } = setup(t);
  const fwd = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Fwd: nothing', body: 'See this.', forward: { mailbox: 'ceo', id: '777' } });
  assert.equal(fwd.status, 404);
  assert.match(fwd.body.error, /No message with id 777 in the inbox\. If it was archived or sent, search with folder "archive"/);
  const att = await call('pam', 'propose', { mailbox: 'ceo', to: 'acct@firm.com', subject: 'Receipts', body: 'Attached.', attach_from: [{ mailbox: 'ceo', id: '3' }, { mailbox: 'ceo', id: 'archive:12' }] });
  assert.equal(att.status, 404);
  assert.match(att.body.error, /No message with id 12 in that folder/);
  assert.equal(approvals.waiting().length, 0, 'no card for the owner');
});
