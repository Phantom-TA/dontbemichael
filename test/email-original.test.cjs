'use strict';

/**
 * The owner's look at one email (docs/designs/original-email-view.md): where
 * MailService.original searches, its own read only connection (R1, R5), its
 * failures, and the link a mail read now gives (C1). The fake client checks
 * the rules; the real ImapFlow against hoodiecrow checks that opening an email
 * never marks it read.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const hoodiecrow = require('hoodiecrow-imap');
const { ImapFlow } = require('imapflow');

const { MailService, handleMailRequest } = loadTs('src/main/mail.ts');
const { MAIL_TOOL_OPS } = loadTs('src/shared/mailboxes.ts');

const server = { host: 'h', port: 993, secure: true };
const raw = (id, subject = 'Re: Free scoping review') => Buffer.from(`From: "Dana Ortiz" <dana@northwind.example>\r\nTo: ops@business.example\r\nCc: Sam Lee <sam@northwind.example>\r\nSubject: ${subject}\r\nMessage-ID: ${id}\r\nDate: Mon, 27 Oct 2026 09:14:00 +0000\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hi, <img src="https://t.example/logo.png"></p>\r\n`);

/** A fake mailbox: folders, which uid holds which Message-ID, and a log of every call. */
function fakeService({ provider = 'other', folders, holds = {}, failConnect, removed } = {}) {
  const log = { connects: 0, locks: [], searches: [], changes: 0, logouts: 0, closes: 0, clients: [] };
  const list = folders ?? [
    { path: 'INBOX' },
    { path: 'Archive', specialUse: '\\Archive' },
    { path: 'Sent', specialUse: '\\Sent' },
    { path: 'Spam', specialUse: '\\Junk' },
    { path: 'Trash', specialUse: '\\Trash' },
    { path: 'Drafts', specialUse: '\\Drafts' },
    { path: 'Clients' }
  ];
  const config = { mailboxes: removed ? [] : [{ id: 'ops', address: 'ops@business.example', provider, imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 }] };
  const deps = {
    getConfig: () => config,
    getPassword: () => 'pw',
    markStatus: () => {},
    createImap: () => {
      let current = null;
      const c = {
        async connect() { log.connects++; if (failConnect) throw failConnect; },
        async logout() { log.logouts++; },
        close() { log.closes++; },
        async list() { return list; },
        async getMailboxLock(p, opts) { current = p; log.locks.push({ path: p, readOnly: opts?.readOnly === true }); return { release() {} }; },
        async search(q) {
          log.searches.push({ path: current, q });
          const id = q.gmraw ? q.gmraw.replace('rfc822msgid:', '') : q.header?.['message-id'];
          const at = holds[current];
          return at && at.id === id ? [at.uid] : [];
        },
        async fetchOne(uid, q) {
          const at = Object.values(holds).find((h) => String(h.uid) === String(uid));
          if (!at) return false;
          if (q.source) return { uid, source: raw(at.id), flags: new Set() };
          return { uid, size: at.size ?? 500 };
        },
        fetch() { throw new Error('not used'); },
        async append() { throw new Error('never appends'); },
        async messageFlagsAdd() { log.changes++; },
        async messageMove() { log.changes++; }
      };
      log.clients.push(c);
      return c;
    }
  };
  return { svc: new MailService(deps), log, deps };
}

const ID = '<m1@northwind.example>';

test('an email archived after the agent read it is found, every folder opened read only', async () => {
  const { svc, log } = fakeService({ holds: { Clients: { id: ID, uid: 7 } } });
  const e = await svc.original('ops', ID);
  assert.equal(e.subject, 'Re: Free scoping review');
  assert.equal(e.fromName, 'Dana Ortiz');
  assert.equal(e.fromAddress, 'dana@northwind.example');
  assert.match(e.cc, /sam@northwind\.example/);
  assert.match(e.html, /logo\.png/);
  assert.equal(e.mailboxAddress, 'ops@business.example');
  assert.deepEqual(log.searches.map((s) => s.path), ['INBOX', 'Archive', 'Sent', 'Clients'], 'inbox, archive, sent, then the rest');
  assert.ok(log.locks.every((l) => l.readOnly), 'EXAMINE everywhere');
  assert.equal(log.changes, 0, 'nothing marked, moved or flagged');
  assert.equal(log.logouts, 1, 'its own connection, closed after');
});

test('spam, trash and drafts are never searched', async () => {
  const { svc, log } = fakeService({ holds: { Spam: { id: ID, uid: 3 } } });
  await assert.rejects(svc.original('ops', ID), (e) => e.kind === 'not-found' && e.message === 'message');
  for (const p of ['Spam', 'Trash', 'Drafts']) assert.ok(!log.searches.some((s) => s.path === p), p);
});

test('Gmail finds it under any label with one search of All Mail', async () => {
  const { svc, log } = fakeService({
    provider: 'gmail',
    folders: [{ path: 'INBOX' }, { path: '[Gmail]/All Mail', specialUse: '\\All' }, { path: '[Gmail]/Spam', specialUse: '\\Junk' }],
    holds: { '[Gmail]/All Mail': { id: ID, uid: 42 } }
  });
  const e = await svc.original('ops', ID);
  assert.equal(e.subject, 'Re: Free scoping review');
  assert.deepEqual(log.searches, [{ path: '[Gmail]/All Mail', q: { gmraw: `rfc822msgid:${ID}` } }]);
});

test('a removed mailbox and a missing email fail apart', async () => {
  await assert.rejects(fakeService({ removed: true }).svc.original('ops', ID), (e) => e.kind === 'not-found' && e.message === 'mailbox');
  await assert.rejects(fakeService().svc.original('ops', ID), (e) => e.kind === 'not-found' && e.message === 'message');
});

test('a sign in failure keeps its kind and the connection is closed', async () => {
  const { svc, log } = fakeService({ failConnect: Object.assign(new Error('Invalid credentials'), { authenticationFailed: true }) });
  await assert.rejects(svc.original('ops', ID), (e) => e.kind === 'auth');
  assert.equal(log.logouts, 1);
});

test('the same email asked twice shares one open, and a later open is served from memory', async () => {
  const { svc, log } = fakeService({ holds: { INBOX: { id: ID, uid: 1 } } });
  const [a, b] = await Promise.all([svc.original('ops', ID), svc.original('ops', ID)]);
  assert.equal(a, b);
  assert.equal(log.connects, 1);
  await svc.original('ops', '<M1@northwind.example>'.replace('M1', 'm1'));
  assert.equal(log.connects, 1, 'kept');
  assert.equal(svc.keptOriginal('ops', ID).subject, 'Re: Free scoping review');
});

test('two different emails of one mailbox open one after the other', async () => {
  const { log, deps } = fakeService({ holds: { INBOX: { id: ID, uid: 1 } } });
  let open = 0; let most = 0;
  const make = deps.createImap;
  deps.createImap = (...a) => {
    const c = make(...a);
    const { connect, logout } = c;
    c.connect = async () => { open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 10)); return connect(); };
    c.logout = async () => { open--; return logout(); };
    return c;
  };
  const svc = new MailService(deps);
  const results = await Promise.allSettled([svc.original('ops', ID), svc.original('ops', '<m2@northwind.example>')]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected', 'the second is not in the mailbox');
  assert.equal(log.connects, 2);
  assert.equal(most, 1, 'never two owner connections to one mailbox at once');
});

test('closing the tab closes that open\'s connection', async () => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const { svc, log, deps } = fakeService({ holds: { INBOX: { id: ID, uid: 1 } } });
  const make = deps.createImap;
  deps.createImap = (...a) => { const c = make(...a); const connect = c.connect; c.connect = async () => { await gate; return connect(); }; return c; };
  const svc2 = new MailService(deps);
  const run = svc2.original('ops', ID).catch((e) => e);
  await new Promise((r) => setImmediate(r));
  svc2.cancelOriginal('ops', ID);
  assert.equal(log.closes, 1);
  release();
  await run;
  void svc;
});

test('no agent tool reaches the owner view', () => {
  for (const op of ['original', 'originalPictures', 'original_email']) assert.equal(Object.prototype.hasOwnProperty.call(MAIL_TOOL_OPS, op), false, op);
  const main = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  for (const ch of ['EMAIL_IPC.original', 'EMAIL_IPC.pictures', 'EMAIL_IPC.cancel']) {
    const at = main.indexOf(`ipcMain.handle(${ch}`);
    assert.ok(at > 0, ch);
    assert.match(main.slice(at, at + 400), /fromAppPage\(evt\)/, `${ch} answers only the app window's page`);
  }
  assert.match(main, /evt\.senderFrame === win\.webContents\.mainFrame/);
});

// ── The real client against a local IMAP server ──

const USER = 'ops@business.test';
const PASS = 'app-pass-123';

async function imapServer(t) {
  const imap = hoodiecrow({
    plugins: ['SPECIAL-USE', 'ID', 'UNSELECT', 'ENABLE', 'LITERALPLUS'],
    users: { [USER]: { password: PASS } },
    storage: {
      INBOX: { messages: [{ raw: raw(ID).toString() }] },
      '': { separator: '/', folders: { Sent: { 'special-use': '\\Sent', messages: [] }, Drafts: { 'special-use': '\\Drafts', messages: [] } } }
    }
  });
  const port = await new Promise((resolve) => { imap.listen(0, '127.0.0.1', function () { resolve(this.address().port); }); });
  t.after(() => imap.close());
  return port;
}

test('on a real IMAP server, opening the email leaves it unread, and a read gives its link', { timeout: 15_000 }, async (t) => {
  const port = await imapServer(t);
  const clients = [];
  const s = { host: '127.0.0.1', port, secure: false };
  const config = {
    mcpDefaults: { 'email-calendar': { enabled: true } },
    mailboxes: [{ id: 'ops', address: USER, provider: 'other', imap: s, smtp: s, status: 'connected', createdAt: 1, updatedAt: 1 }],
    agentCapabilities: { dwight: { email: { enabled: true, mailboxes: ['ops'], send: true } } }
  };
  const deps = {
    getConfig: () => config, getPassword: () => PASS, markStatus: () => {},
    createImap: (srv, user, pass) => { const c = new ImapFlow({ host: srv.host, port: srv.port, secure: false, doSTARTTLS: false, auth: { user, pass }, logger: false }); clients.push(c); return c; }
  };
  const svc = new MailService(deps);
  t.after(() => { svc.closeAll(); for (const c of clients) c.close(); });

  const e = await svc.original('ops', ID);
  assert.equal(e.subject, 'Re: Free scoping review');

  const check = new ImapFlow({ host: '127.0.0.1', port, secure: false, doSTARTTLS: false, auth: { user: USER, pass: PASS }, logger: false });
  await check.connect();
  const lock = await check.getMailboxLock('INBOX', { readOnly: true });
  const m = await check.fetchOne('1', { flags: true });
  lock.release();
  await check.logout();
  assert.equal(m.flags.has('\\Seen'), false, 'still unread after the owner looked');

  const read = await handleMailRequest(svc, deps, 'dwight', 'read', { mailbox: 'ops', id: '1' });
  assert.equal(read.status, 200);
  assert.match(read.body.link, /^\[Dana Ortiz, 2[67] Oct\]\(email:ops\/%3Cm1%40northwind\.example%3E\)$/);
});
