'use strict';

/**
 * The team can find archived and sent mail (owner, 2026-10-03). Michael put a
 * card on Ask me saying Pam's mail tool "can't open archived or sent mail" and
 * pointing the owner at Claude connectors. The mailbox is the app's own IMAP
 * connection, which reaches every Gmail folder; search and read only ever
 * opened INBOX. Inbox zero then archived mail nobody could find again.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { MailService, handleMailRequest, parseMessageId, messageIdFor, folderKey } = loadTs('src/main/mail.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const server = { host: 'h', port: 993, secure: true };
const raw = (from, to, subject, body, id) => Buffer.from(`From: ${from}\r\nTo: ${to}\r\nSubject: ${subject}\r\nMessage-ID: <${id}@x.com>\r\nDate: Fri, 25 Sep 2026 10:00:00 +0000\r\n\r\n${body}\r\n`);
const msg = (uid, from, subject, body, id) => ({ uid, from, subject, source: raw(from, 'office@x.com', subject, body, id) });

/** A Gmail-shaped fake: the same message has a different uid in each folder. */
function setup() {
  const state = {
    folders: {
      INBOX: [msg(1, 'new@client.com', 'New question', 'Is it in stock?', 'n1')],
      '[Gmail]/All Mail': [
        msg(7, 'new@client.com', 'New question', 'Is it in stock?', 'n1'),
        msg(8, 'hr@x.com', 'Offer letter for the new hire', 'The offer letter is attached.', 'o1'),
        msg(9, 'office@x.com', 'Re: your order', 'Thanks, it ships Monday.', 's1')
      ],
      '[Gmail]/Sent Mail': [msg(3, 'office@x.com', 'Re: your order', 'Thanks, it ships Monday.', 's1')],
      Finance: [msg(4, 'bank@x.com', 'Statement', 'Your statement is ready.', 'f1')],
      '[Gmail]/Drafts': []
    },
    opened: []
  };
  let folder = 'INBOX';
  const imap = {
    usable: true,
    async connect() {}, async logout() {},
    async list() {
      const uses = { '[Gmail]/All Mail': '\\All', '[Gmail]/Sent Mail': '\\Sent', '[Gmail]/Drafts': '\\Drafts' };
      return Object.keys(state.folders).map((p) => ({ path: p, delimiter: /^INBOX\./.test(p) ? '.' : '/', ...(uses[p] ? { specialUse: uses[p] } : {}) }));
    },
    async getMailboxLock(p) { folder = p; state.opened.push(p); return { release() {} }; },
    async search(q) { return state.folders[folder].filter((m) => (!q.subject || m.subject.includes(q.subject)) && !(q.draft === false && m.flags?.has('\\Draft'))).map((m) => m.uid); },
    async *fetch(uids) { for (const m of state.folders[folder]) if (uids.includes(m.uid)) yield { uid: m.uid, envelope: { from: [{ address: m.from }], subject: m.subject, date: new Date('2026-09-25') }, flags: new Set() }; },
    async fetchOne(uid) { const m = state.folders[folder].find((x) => String(x.uid) === String(uid)); return m ? { source: m.source, flags: m.flags ?? new Set() } : false; },
    async append(p, content) { state.folders[p].push({ uid: 50, source: content }); }
  };
  const config = {
    mailboxes: [{ id: 'office', address: 'office@x.com', provider: 'google-workspace', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 }],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['office'], send: false } } }
  };
  const deps = { getConfig: () => config, getPassword: () => 'app-pass', markStatus() {}, createImap: () => imap, createSmtp: () => ({ async sendMail() {}, close() {} }) };
  const svc = new MailService(deps);
  return { state, svc, imap, call: (op, body) => handleMailRequest(svc, deps, 'pam', op, { mailbox: 'office', ...body }) };
}

test('ids carry their folder, and a bare number is the inbox as before', () => {
  // Value: protects=a uid is never read in the wrong folder, where it opens another message; fails_when=an id loses its folder or a malformed one is guessed; why_new=new; seam=none
  assert.deepEqual(parseMessageId('12'), { key: 'inbox', uid: '12' });
  assert.deepEqual(parseMessageId('sent:3'), { key: 'sent', uid: '3' });
  assert.deepEqual(parseMessageId('archive:8'), { key: 'archive', uid: '8' });
  assert.deepEqual(parseMessageId('label:Clients: West:4'), { key: { label: 'Clients: West' }, uid: '4' });
  for (const bad of ['x', 'sent:', 'trash:4', '12a']) assert.throws(() => parseMessageId(bad), /is not a message id from search/, bad);
  assert.equal(messageIdFor('inbox', 5), '5');
  assert.equal(messageIdFor({ label: 'Finance' }, 4), 'label:Finance:4');
  assert.equal(folderKey(undefined), 'inbox');
  assert.equal(folderKey('All Mail'), 'archive');
  assert.deepEqual(folderKey('Finance'), { label: 'Finance' });
});

test('archived mail is found in All Mail and read by its own id', async () => {
  // Value: protects=an archived offer letter can be found again; fails_when=search stays in INBOX or read opens the inbox uid; why_new=search and read were hardwired to INBOX; seam=none
  const { call, state } = setup();
  const inbox = await call('search', { subject: 'Offer' });
  assert.deepEqual(inbox.body.messages, [], 'not in the inbox');
  const found = await call('search', { folder: 'archive', subject: 'Offer' });
  assert.equal(found.status, 200);
  assert.equal(found.body.folder, 'archive');
  assert.deepEqual(found.body.messages.map((m) => [m.id, m.subject]), [['archive:8', 'Offer letter for the new hire']]);
  const r = await call('read', { id: 'archive:8' });
  assert.equal(r.status, 200);
  assert.equal(r.body.id, 'archive:8');
  assert.match(r.body.text, /offer letter is attached/);
  assert.equal(state.opened.at(-1), '[Gmail]/All Mail');
  // An old inbox id of mail that was archived says where to look instead.
  // Value: protects=an agent reading a stale inbox id is told to search the archive; fails_when=the not-found text stops naming the folder and the archive search; why_new=owner 2026-10-04, Pam read an archived id and blamed her mail connection; seam=none
  const stale = await call('read', { id: '8' });
  assert.notEqual(stale.status, 200);
  assert.match(stale.body.error, /No message with id 8 in the inbox\. If it was archived or sent, search with folder "archive" or "sent"/);
  const gone = await call('read', { id: 'archive:999' });
  assert.match(gone.body.error, /No message with id 999 in that folder\. Search again for its current id\./);
  // An empty inbox search points to the archive and Sent; other searches carry no hint.
  // Value: protects=an agent that searched only the inbox learns where else to look; fails_when=the empty inbox answer drops the hint; why_new=owner 2026-10-04, Pam searched the inbox only after the fix and asked the owner again; seam=none
  assert.match(inbox.body.hint, /folder "archive"[\s\S]*folder "sent"/);
  assert.equal(found.body.hint, undefined);
});

test('sent mail and labels are searchable; a missing label says so', async () => {
  // Value: protects=the team can check whether the owner replied, and find mail filed under a label; fails_when=Sent or a label is unreachable or a missing label errors vaguely; why_new=new; seam=none
  const { call } = setup();
  const sent = await call('search', { folder: 'sent' });
  assert.deepEqual(sent.body.messages.map((m) => [m.id, m.subject]), [['sent:3', 'Re: your order']]);
  assert.match((await call('read', { id: 'sent:3' })).body.text, /ships Monday/);
  const label = await call('search', { folder: 'Finance' });
  assert.deepEqual(label.body.messages.map((m) => m.id), ['label:Finance:4']);
  const missing = await call('search', { folder: 'Payroll' });
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /no label or folder called "Payroll"/);
});

test('a reply to sent or archived mail is threaded from its own folder', async () => {
  // Value: protects=reply_to, forward and attach_from work on any folder's id; fails_when=references are fetched from INBOX only; why_new=compose read every reference in INBOX; seam=none
  const { call, state } = setup();
  const d = await call('draft', { to: 'client@x.com', subject: 'Re: your order', body: 'Following up.', reply_to: { mailbox: 'office', id: 'sent:3' } });
  assert.equal(d.status, 200);
  const draft = state.folders['[Gmail]/Drafts'][0].source.toString();
  assert.match(draft, /In-Reply-To: <s1@x\.com>/);
  assert.ok(state.opened.includes('[Gmail]/Sent Mail'));
});

test('archive and mark read take inbox ids only', async () => {
  // Value: protects=a sent or archived id is never moved or mistaken for an inbox uid; fails_when=a qualified id is silently dropped or acted on; why_new=new; seam=none
  const { call } = setup();
  const r = await call('archive', { ids: ['archive:8'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /archive works on inbox messages only; "archive:8" is already out of the inbox\./);
});

test('the tools say where mailbox access comes from, so a limit is not blamed on a setting', async () => {
  // Value: protects=Michael never sends the owner to Claude connectors for the app's own mailbox; fails_when=the tool text or list result stops naming Settings, Connections, Mailboxes, or rule 6 stops forbidding guessed settings; why_new=Michael's card named a setting that does not exist; seam=none
  const { call } = setup();
  const list = await call('list_mailboxes', {});
  assert.match(list.body.source, /^Settings, Connections, Mailboxes \(the app's own mail connection, not a Claude connector\)$/);
  const mcp = read('resources/md-mail-mcp.cjs');
  assert.match(mcp, /The mailbox is the app\\'s own connection, set up in Settings, Connections, Mailboxes; it is not a Claude connector\./);
  assert.match(mcp, /report a limit as a gap in the tool, without suggesting a setting/);
  assert.match(mcp, /folder: \{ type: 'string', description: 'Where to look: "inbox" \(the default\), "sent", "archive", or a label name\.' \}/);
  assert.match(read('src/main/hive.ts'), /offer the owner a setting or a fix only when a tool result or your instructions name it/);
});

test('Draft only is named as the member\'s Access tab, never as a limit of the mailbox connection', async () => {
  // Value: protects=a team member never tells the owner the mailbox connection blocks sending; fails_when=the list result, the refusal, the tool text or the roster stop naming Access, Email, Sending; why_new=Kelly told the owner Pam's draft only lived in Settings, Connections, Mailboxes, which has no such switch; seam=none
  const { call } = setup();
  const list = await call('list_mailboxes', {});
  assert.match(list.body.sending_set_in, /^your Access tab, Email, Sending \(the owner chooses Can send, Send on approval or Draft only for you; the mailbox connection itself can send\)$/);
  const { mailAccess } = loadTs('src/shared/mailboxes.ts');
  const cfg = { mailboxes: [{ id: 'office' }], agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['office'], send: false } } } };
  const refused = mailAccess(cfg, 'pam', 'office', 'send');
  assert.equal(refused.ok, false);
  assert.match(refused.reason, /on your Access tab \(Email, Sending\); the mailbox itself can send/);
  assert.match(read('resources/md-mail-mcp.cjs'), /Can send, Send on approval or Draft only is the owner\\'s choice for you on your Access tab \(Email, Sending\), not a limit of the mailbox/);
  const { accessLine } = loadTs('src/shared/agentAccess.ts');
  assert.doesNotMatch(accessLine([{ kind: 'mailbox', address: 'office@x.com', sending: 'draft' }]), /Mailboxes; draft only\)/);
});

/**
 * A team member may hold the app's own mailbox, Claude connectors, or both, and
 * the roster names each with its Settings screen.
 */
test('Michael sees each member\'s mail access and its Settings screen, whichever kind it is', async (t) => {
  // Value: protects=Michael names the right screen for Mailboxes, Claude connectors or both; fails_when=one kind is missing from the roster, a change does not resend it, or the hook stops passing access; why_new=the roster said nothing about access, so Michael guessed; seam=source pin for the hook wiring
  const { accessLine } = loadTs('src/shared/agentAccess.ts');
  const mailbox = { kind: 'mailbox', address: 'office@x.com', sending: 'draft' };
  const hubspot = { kind: 'connector', key: 'HubSpot' };
  assert.equal(accessLine([mailbox]), 'mailbox office@x.com (connected in Settings, Connections, Mailboxes; draft only, set on their Access tab, Email, Sending)');
  assert.equal(accessLine([hubspot]), 'Claude connectors HubSpot (Settings, Connections, Claude connectors)');
  assert.equal(accessLine([mailbox, hubspot, { kind: 'quickbooks', changes: false }]), 'mailbox office@x.com (connected in Settings, Connections, Mailboxes; draft only, set on their Access tab, Email, Sending); Claude connectors HubSpot, QuickBooks read only (Settings, Connections, Claude connectors)');
  assert.equal(accessLine([]), null);

  const os = require('node:os');
  const electron = require.resolve('electron');
  require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-access-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  fs.writeFileSync(path.join(hive.root(), 'fleet.json'), JSON.stringify({ agents: [
    { id: 'god', name: 'Michael', isGod: true }, { id: 'pam', name: 'Pam', role: 'Executive Admin' }, { id: 'kelly', name: 'Kelly', role: 'Support' }, { id: 'oscar', name: 'Oscar', role: 'Finance' }
  ] }));
  const access = { pam: accessLine([mailbox, hubspot]), kelly: accessLine([hubspot]), oscar: null };
  const r = hive.teamRoster((id) => access[id]);
  assert.match(r.full, /- Pam \(pam\), Executive Admin; uses: mailbox office@x\.com \(connected in Settings, Connections, Mailboxes; draft only, set on their Access tab, Email, Sending\); Claude connectors HubSpot \(Settings, Connections, Claude connectors\)/);
  assert.match(r.full, /- Kelly \(kelly\), Support; uses: Claude connectors HubSpot \(Settings, Connections, Claude connectors\)/);
  assert.match(r.full, /- Oscar \(oscar\), Finance; uses: no mail or connectors/);
  access.oscar = accessLine([mailbox]);
  assert.notEqual(hive.teamRoster((id) => access[id]).layoutKey, r.layoutKey, 'a new grant resends the full roster');
  assert.doesNotMatch(hive.teamRoster().full, /uses:/, 'without access the roster reads as before');
  assert.match(read('src/main/hooks.ts'), /this\.hive\.teamRoster\(\(id\) => accessLine\(agentAccessSummary\(cfg, id, this\.roleReadsBooks\?\.\(id\) \?\? false, this\.memberPresent\)\)\)/);
});

test('the team reads that mail comes only through the app\'s mailboxes', () => {
  // Value: protects=no job or tool text sends a member to the Claude account's mail; fails_when=a job offers a Claude connector for mail, or the mail tools stop saying they are the only way in; why_new=owner 2026-10-30 (email only via the app's connector); seam=none; no_claim=jobs already saved in an office
  for (const f of fs.readdirSync(path.resolve(__dirname, '../resources/packs')).filter((x) => x.endsWith('.json'))) {
    const p = JSON.parse(read(`resources/packs/${f}`));
    for (const j of p.starterMissions || []) assert.doesNotMatch(j.focus, /no mailbox/i, `${f}: ${j.title}`);
    const pam = (p.starterMissions || []).find((j) => j.agentId === 'pam' && j.title === 'Inbox to zero');
    if (pam) assert.match(pam.focus, /If you have no email tools yet, stop without messaging anyone\.$/, f);
  }
  assert.match(read('resources/md-mail-mcp.cjs'), /Email reaches you only through these tools; the owner\\'s Claude account mail is never yours to use\./);
});

/** A mailbox that is not Gmail: folders as `list` names them, each holding one message. */
function folderService(list) {
  const opened = [];
  let folder = 'INBOX';
  const imap = {
    usable: true,
    async connect() {}, async logout() {},
    async list() { return list; },
    async getMailboxLock(p) { folder = p; opened.push(p); return { release() {} }; },
    async search() { return [5]; },
    async *fetch() { yield { uid: 5, envelope: { from: [{ address: 'a@x.com' }], subject: `In ${folder}`, date: new Date('2026-09-25') }, flags: new Set() }; },
    async fetchOne() { return false; }
  };
  const config = {
    mailboxes: [{ id: 'office', address: 'office@x.com', provider: 'imap', imap: server, smtp: server, status: 'connected', createdAt: 1, updatedAt: 1 }],
    agentCapabilities: { pam: { email: { enabled: true, mailboxes: ['office'], send: false } } }
  };
  const deps = { getConfig: () => config, getPassword: () => 'app-pass', markStatus() {}, createImap: () => imap, createSmtp: () => ({ async sendMail() {}, close() {} }) };
  const svc = new MailService(deps);
  return { opened, search: (folder) => handleMailRequest(svc, deps, 'pam', 'search', { mailbox: 'office', folder }) };
}

test('archive and labels are found outside Gmail too, and a mailbox with no archive says so', async () => {
  // Value: protects=archive and label search work on non Gmail IMAP (Archive folder, INBOX.<label>); fails_when=the \Archive or "Archive" fallback, All Mail precedence or the INBOX delimiter lookup is lost, or a missing archive is not a clear 404; why_new=the Gmail fake only covers \All and top level labels; seam=none
  const both = folderService([{ path: 'INBOX' }, { path: 'Archive', specialUse: '\\Archive' }, { path: '[Gmail]/All Mail', specialUse: '\\All' }]);
  assert.equal((await both.search('archive')).status, 200);
  assert.equal(both.opened.at(-1), '[Gmail]/All Mail', 'All Mail first, as it holds everything');

  const special = folderService([{ path: 'INBOX' }, { path: 'Old mail', specialUse: '\\Archive' }]);
  const r = await special.search('archived');
  assert.deepEqual([r.status, r.body.folder, r.body.messages.map((m) => m.id)], [200, 'archive', ['archive:5']]);
  assert.equal(special.opened.at(-1), 'Old mail');

  const named = folderService([{ path: 'INBOX' }, { path: 'INBOX.Archive', delimiter: '.' }, { path: 'INBOX.Finance', delimiter: '.' }]);
  assert.equal((await named.search('archive')).status, 200);
  assert.equal(named.opened.at(-1), 'INBOX.Archive');
  const label = await named.search('finance');
  assert.deepEqual([label.status, label.body.messages.map((m) => m.id)], [200, ['label:finance:5']]);
  assert.equal(named.opened.at(-1), 'INBOX.Finance', 'a label under the inbox, matched without case');

  const none = folderService([{ path: 'INBOX' }, { path: 'Sent', specialUse: '\\Sent' }]);
  const missing = await none.search('archive');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /no archive folder yet: nothing has been archived/);
  assert.deepEqual(none.opened, [], 'nothing is opened in place of it');
});

test('a long label id reads the message search gave, and spam, trash and drafts stay closed', async () => {
  // Value: protects=read opens the message search returned for a long label, and a label search never opens spam, trash or the owner's drafts; fails_when=the read id is cut short (it parsed "label:Clients/Northwind Cafe Invoices:45" for uid 4521) or the off limits check goes; why_new=ship review 2026-10-03 red team and security findings; seam=none
  const { state, call } = setup();
  const label = 'Clients/Northwind Cafe Invoices';
  state.folders[label] = [msg(4521, 'cafe@x.com', 'Invoice 4521', 'Paid in full.', 'i1'), msg(45, 'other@x.com', 'Unrelated', 'Wrong message.', 'i2')];
  const id = messageIdFor({ label }, 4521);
  assert.ok(id.length > 40, 'the case that used to be cut');
  const r = await call('read', { id });
  assert.equal(r.status, 200);
  assert.match(JSON.stringify(r.body), /Paid in full/);
  assert.doesNotMatch(JSON.stringify(r.body), /Wrong message/);
  for (const folder of ['[Gmail]/Drafts', '[gmail]/drafts']) {
    const s = await call('search', { folder });
    assert.equal(s.status, 400, folder);
    assert.match(s.body.error, /spam, trash or drafts/);
  }
  const before = state.opened.length;
  assert.equal((await call('read', { id: 'label:[Gmail]/Drafts:1' })).status, 400);
  assert.equal(state.opened.slice(before).includes('[Gmail]/Drafts'), false, 'the drafts folder is never opened');
});

test('archive search lists newest first, and a mix of inbox and folder ids cannot be archived', async () => {
  // Value: protects=archive:N results sort newest first like the inbox (their ids carry a prefix, so Number(id) would be NaN), and archive refuses any non inbox id in a batch; fails_when=the sort goes back to Number(b.id) or the guard checks only the first id; why_new=ship review 2026-10-03 testing finding; seam=none
  const { state, call } = setup();
  state.folders['[Gmail]/All Mail'] = [
    msg(8, 'a@x.com', 'Invoice older', 'one', 'a1'), msg(12, 'b@x.com', 'Invoice newest', 'two', 'b1'), msg(9, 'c@x.com', 'Invoice middle', 'three', 'c1')
  ];
  const r = await call('search', { folder: 'archive', subject: 'Invoice' });
  assert.equal(r.status, 200);
  const ids = (r.body.messages ?? r.body.results ?? r.body).map((m) => m.id);
  assert.deepEqual(ids, ['archive:12', 'archive:9', 'archive:8']);
  const mixed = await call('archive', { ids: ['1', 'archive:12'] });
  assert.equal(mixed.status, 400);
});

test('spam, junk and trash stay closed by flag, by name and under a parent; a draft found in All Mail is refused', async () => {
  // Value: protects=a label search never opens spam, junk, bulk or trash folders (flagged, only named, or a child of one) and an unsent draft is never read even from the archive; fails_when=OFF_LIMITS_NAMES or the Junk/Trash uses go, the parent walk goes, or source() stops checking the Draft flag; why_new=ship review pass 2 security and testing findings; seam=none
  const { state, call } = setup();
  Object.assign(state.folders, { Spam: [], 'INBOX.Junk': [], 'Deleted Items': [], 'Bulk Mail': [], Trash: [], 'Trash/Old': [] });
  for (const folder of ['Spam', 'inbox.junk', 'Deleted Items', 'Bulk Mail', 'Trash/Old']) {
    const before = state.opened.length;
    const r = await call('search', { folder });
    assert.equal(r.status, 400, folder);
    assert.deepEqual(state.opened.slice(before), [], `${folder} never opened`);
  }
  // A draft that Gmail also files under All Mail.
  state.folders['[Gmail]/All Mail'].push({ uid: 77, from: 'office@x.com', subject: 'Draft reply', source: Buffer.from('Subject: Draft reply\r\n\r\nNot sent yet.'), flags: new Set(['\\Draft']) });
  const r = await call('read', { id: 'archive:77' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /unsent draft/);
  assert.match(read('src/main/mail.ts'), /query\.draft = false;/);
});

test('a folder only its flag marks stays closed, drafts never come back from a search, and the archive is not \\All off Gmail', async () => {
  // Value: protects=a trash folder known only by its \Trash flag (and its children) stays closed, a search of All Mail never lists a draft, and a non Gmail server uses its \Archive folder; fails_when=OFF_LIMITS_USES or the parent walk goes, the draft criterion is not sent, or the archive picks \All everywhere; why_new=ship review pass 3 testing and security findings; seam=none
  const { state, call } = setup();
  // Flag only: Rubbish carries \Trash and nothing in its name says so.
  const flagged = setupWith({ Rubbish: '\\Trash', 'Rubbish/2025': '' });
  for (const folder of ['Rubbish', 'Rubbish/2025']) {
    const before = flagged.state.opened.length;
    const r = await flagged.call('search', { folder });
    assert.equal(r.status, 400, folder);
    assert.deepEqual(flagged.state.opened.slice(before), [], `${folder} never opened`);
  }
  // A draft in All Mail is not listed by a search.
  state.folders['[Gmail]/All Mail'].push({ uid: 78, from: 'office@x.com', subject: 'Offer draft', source: Buffer.from('Subject: Offer draft\r\n\r\nNot sent.'), flags: new Set(['\\Draft']) });
  const r = await call('search', { folder: 'archive', subject: 'Offer' });
  assert.equal(r.status, 200);
  const ids = (r.body.messages ?? []).map((m) => m.id);
  assert.ok(ids.includes('archive:8'), 'the real archived offer letter is found');
  assert.ok(!ids.includes('archive:78'), 'the draft is not');
  // A non Gmail server: \All is not the archive, \Archive is.
  const other = setupWith({ 'All Mail': '\\All', Archive: '\\Archive' }, { gmail: false });
  other.state.folders.Archive = [msg(5, 'a@x.com', 'Old order', 'Shipped.', 'x5')];
  other.state.folders['All Mail'] = [msg(6, 'b@x.com', 'Spam in All', 'Junk.', 'x6')];
  const a = await other.call('search', { folder: 'archive' });
  assert.deepEqual((a.body.messages ?? []).map((m) => m.id), ['archive:5']);
});

/** setup() with extra special use flags, and optionally no Gmail folders. */
function setupWith(uses, opts = {}) {
  const s = setup();
  const realList = s.imap.list.bind(s.imap);
  s.imap.list = async () => (await realList())
    .filter((f) => opts.gmail !== false || !/^\[Gmail\]\//.test(f.path))
    .map((f) => (uses[f.path] ? { ...f, specialUse: uses[f.path] } : f));
  for (const p of Object.keys(uses)) if (!s.state.folders[p]) s.state.folders[p] = [];
  return s;
}
