'use strict';

/**
 * Add a folder on a Company foundations card (eng review 2026-10-26): the
 * answer names the folder where it is (D1), checked for plain mistakes only
 * (D3), and the members whose job uses the question read it, read only, even
 * inside the business folder. Every other member keeps today's rules (D2).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { Notification: class { show() {} static isSupported() { return false; } } } };

const F = loadTs('src/shared/foundations.ts');
const { Foundations } = loadTs('src/main/foundations.ts');
const { folderDecision, folderPolicy } = loadTs('src/shared/folderAccess.ts');
const FS = loadTs('src/renderer/src/shell/foundationSave.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

/** A temp computer: a home folder holding the app's home and a business folder
 *  with a Finance records folder and a member's folder. */
function office(t) {
  const user = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'md-fold-')));
  t.after(() => fs.rmSync(user, { recursive: true, force: true }));
  const appHome = path.join(user, '.dontbemichael');
  const business = path.join(user, 'Documents', 'Pho');
  const records = path.join(business, 'Money records');
  const oscar = path.join(business, 'Oscar');
  const elsewhere = path.join(user, 'Dropbox', 'Books');
  for (const d of [appHome, records, path.join(records, '2026'), oscar, elsewhere, path.join(user, 'Empty', 'Inner')]) fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(records, '2026', 'bank.csv'), 'date,amount\n');
  fs.writeFileSync(path.join(oscar, 'notes.md'), 'x');
  fs.writeFileSync(path.join(elsewhere, 'ledger.xlsx'), 'x');
  const w = new Foundations({
    home: () => appHome,
    publishDelayMs: 60_000,
    folderBounds: () => ({ userHome: user, business, team: [oscar] })
  });
  return { user, appHome, business, records, oscar, elsewhere, w };
}

test('a folder is refused only for plain mistakes, each with its own reason', (t) => {
  // Value: protects=the owner's folder is refused for each obvious mistake with its own line, and a good folder is taken; fails_when=a guard is dropped or returns the wrong reason; why_new=new path; seam=none; no_claim=Windows drive paths (temp folders on this machine)
  const o = office(t);
  const ok = o.w.checkFolder('money', o.records);
  assert.deepEqual(ok, { ok: true, path: o.records, name: 'Money records' }, 'a file one level down is enough');
  assert.deepEqual(o.w.checkFolder('nope', o.records), { ok: false, error: 'unknown' });
  assert.deepEqual(o.w.checkFolder('money', 'Money records'), { ok: false, error: 'no-folder' }, 'not absolute');
  assert.deepEqual(o.w.checkFolder('money', path.join(o.user, 'gone')), { ok: false, error: 'no-folder' });
  assert.deepEqual(o.w.checkFolder('money', path.join(o.elsewhere, 'ledger.xlsx')), { ok: false, error: 'no-folder' }, 'a file is not a folder');
  assert.deepEqual(o.w.checkFolder('money', path.parse(o.user).root), { ok: false, error: 'too-wide' }, 'a drive root');
  assert.deepEqual(o.w.checkFolder('money', o.user), { ok: false, error: 'too-wide' }, 'the home folder');
  assert.deepEqual(o.w.checkFolder('money', path.join(o.user, 'Documents')), { ok: false, error: 'too-wide' }, 'holds the business folder');
  assert.deepEqual(o.w.checkFolder('money', o.business), { ok: false, error: 'too-wide' }, 'the business folder itself');
  assert.deepEqual(o.w.checkFolder('money', o.appHome), { ok: false, error: 'app-folder' });
  assert.deepEqual(o.w.checkFolder('money', o.oscar), { ok: false, error: 'member-folder' });
  assert.deepEqual(o.w.checkFolder('money', path.join(o.user, 'Empty')), { ok: false, error: 'empty' });
  const deep = path.join(o.elsewhere, ...Array.from({ length: 30 }, (_, i) => `level${i}`));
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'a.txt'), 'x');
  assert.deepEqual(o.w.checkFolder('money', deep), { ok: false, error: 'too-long' });
  // A folder with more to read than the probe reads is not called empty: client folders, one per client (review, 2026-10-27).
  const clients = path.join(o.user, 'Clients');
  for (let i = 0; i < 205; i++) fs.mkdirSync(path.join(clients, `Client ${i}`, '2026'), { recursive: true });
  assert.equal(o.w.checkFolder('money', clients).ok, true);
});

test('the owner\'s folder answer names the real folder and grants only the jobs that use it', (t) => {
  // Value: protects=only the owner's own folder answer opens a folder, and only to members whose job asks the question; fails_when=the grant reads member or Michael refs, or ignores jobs; why_new=new access rule; seam=none; no_claim=none beyond protects
  const o = office(t);
  // Picked through a link: the answer names the folder it really is. Windows
  // may refuse to make a link without admin rights; the real folder then.
  let link = path.join(o.user, 'Books link');
  try { fs.symlinkSync(o.records, link, 'dir'); } catch { link = o.records; }
  const r = o.w.answerFolder('money', link, 'Bank and card statements, by month.');
  assert.equal(r.ok, true);
  assert.equal(r.text, `Bank and card statements, by month. Kept in the folder ${o.records}`, 'the real folder, after the words');
  const a = o.w.read().answers.money;
  assert.deepEqual([a.by, a.source, a.ref], ['owner', 'owner', `folder:${o.records}`]);
  assert.deepEqual(F.readFoldersFor(o.w.read(), ['finance']), [o.records]);
  assert.deepEqual(F.readFoldersFor(o.w.read(), ['sales']), [], 'sales does not use the money question');
  assert.deepEqual(F.readFoldersFor(o.w.read(), []), []);
  // A refused folder writes nothing.
  assert.deepEqual(o.w.answerFolder('owed', o.business, ''), { ok: false, error: 'too-wide' });
  assert.equal(o.w.read().answers.owed, undefined);
  // Only the owner's card answer counts: the same ref from anyone else opens nothing.
  const rec = F.emptyRecord();
  rec.answers.money = { text: 'x', by: 'god', source: 'owner', ref: `folder:${o.records}`, at: '2026-10-26T10:00:00Z' };
  rec.answers.owed = { text: 'x', by: 'oscar', source: 'taught', ref: `folder:${o.records}`, at: '2026-10-26T10:00:00Z' };
  rec.answers.results = { text: 'x', by: 'owner', source: 'owner', ref: 'folder:relative/path', at: '2026-10-26T10:00:00Z' };
  assert.deepEqual(F.namedFolders(rec), []);
  // A new answer replaces the folder, and the grant goes with it.
  o.w.ownerAnswer('money', 'In the accounting app.');
  assert.deepEqual(F.readFoldersFor(o.w.read(), ['finance']), []);
});

test('the folder line keeps the whole folder and trims the words', () => {
  // Value: protects=the folder in the answer is never cut; fails_when=the path is trimmed to fit the cap; why_new=new line; seam=none; no_claim=none beyond protects
  const p = '/Users/kelly/Documents/Pho/Money records';
  assert.equal(F.folderAnswerLine('', p), `Kept in the folder ${p}`);
  const long = F.folderAnswerLine('word '.repeat(100), p);
  assert.ok(long.endsWith(`. Kept in the folder ${p}`) && long.length <= F.FOUNDATION_CAP);
  assert.equal(F.folderAnswerLine('', `/${'a'.repeat(F.FOUNDATION_CAP)}`), null);
});

test('a granted member reads the named folder in the business folder but never writes there', (t) => {
  // Value: protects=a member whose job uses the question reads the named folder, read only, and links out of it stay refused; fails_when=folderDecision allows writes, skips the grant, or the grant opens what it holds; why_new=folder rules change; seam=none; no_claim=Claude's own sandbox enforcement (hand check)
  const B = path.resolve('/Users/me/Documents/Pho');
  const REC = path.join(B, 'Money records');
  const OSCAR = path.join(B, 'Oscar');
  const ADMIN = path.join(B, 'Admin');
  const layout = { business: B, teamFolders: [OSCAR, ADMIN] };
  const ci = process.platform !== 'linux';
  const oscar = { isGod: false, cwd: OSCAR, readFolders: [REC] };
  const sales = { isGod: false, cwd: ADMIN };
  const stmt = path.join(REC, '2026', 'bank.csv');
  assert.deepEqual(folderDecision(oscar, layout, 'Read', stmt, ci), { deny: false });
  assert.deepEqual(folderDecision(oscar, layout, 'Grep', REC, ci), { deny: false });
  assert.equal(folderDecision(oscar, layout, 'Write', stmt, ci).deny, true, 'read only');
  // Read only outside the business folder too (review, 2026-10-27).
  const BOOKS = path.resolve('/Users/me/Dropbox/Books');
  const keeper = { isGod: false, cwd: OSCAR, readFolders: [BOOKS] };
  assert.deepEqual(folderDecision(keeper, layout, 'Read', path.join(BOOKS, 'ledger.xlsx'), ci), { deny: false });
  assert.equal(folderDecision(keeper, layout, 'Edit', path.join(BOOKS, 'ledger.xlsx'), ci).deny, true, 'named folder elsewhere: read only');
  assert.deepEqual(folderDecision(keeper, layout, 'Write', path.resolve('/Users/me/Dropbox/Other/x.md'), ci), { deny: false }, 'the rest outside stays as before');
  // A grant inside Claude's session records never reopens them to the shell.
  const PROJECTS = path.resolve('/Users/me/.claude/projects');
  const peek = { isGod: false, cwd: OSCAR, readFolders: [path.join(PROJECTS, '-Users-me-Documents-Pho')] };
  assert.equal(folderPolicy(peek, { ...layout, engineRecords: { projects: PROJECTS, history: path.resolve('/Users/me/.claude/history.jsonl') } }, ci).sandbox.allowRead.includes(peek.readFolders[0]), false);
  assert.equal(folderDecision(oscar, layout, 'Read', path.join(B, 'Payroll', 'x.csv'), ci).deny, true, 'the rest of the business folder stays closed');
  assert.equal(folderDecision(sales, layout, 'Read', stmt, ci).deny, true, 'no grant, today\'s rules');
  // The shell reads it from the member's start.
  assert.ok(folderPolicy(oscar, layout, ci).sandbox.allowRead.includes(REC));
  assert.ok(!folderPolicy(sales, layout, ci).sandbox.allowRead.includes(REC));
  // A grant that would open the business folder or a member's folder is dropped.
  for (const bad of [B, path.dirname(B), path.join(ADMIN, 'Sub')]) {
    const agent = { isGod: false, cwd: OSCAR, readFolders: [bad] };
    assert.ok(!folderPolicy(agent, layout, ci).sandbox.allowRead.includes(bad), bad);
    assert.equal(folderDecision(agent, layout, 'Read', path.join(ADMIN, 'Sub', 'x.md'), ci).deny, true, bad);
  }
  // The hook judges a link's real file too: the grant is the real folder.
  const hooks = read('src/main/hooks.ts');
  assert.match(hooks, /readFolders: me\.isGod \? \[\] : \(this\.readFoldersOf\?\.\(agentId\) \?\? \[\]\)/);
  assert.match(read('src/main/index.ts'), /readFolders: opts\.hive!\.isGod \? \[\] : foundationReadFolders\(opts\.hive!\.id\)/);
});

/** A window.cth with each call logged and its answer chosen per test. */
function fakeCth(say = {}) {
  const log = [];
  const answer = (name, dflt) => async (...args) => { log.push([name, ...args]); const a = say[name] ?? dflt; if (a instanceof Error) throw a; return a; };
  const cth = {
    foundationsCheckFolder: answer('foundationsCheckFolder', { ok: true, path: '/Users/kelly/Money records', name: 'Money records' }),
    foundationsAnswerFolder: answer('foundationsAnswerFolder', { ok: true, text: 'x' }),
    hiveSend: answer('hiveSend', { ok: true })
  };
  const onAnswer = async (text) => { log.push(['onAnswer', text]); const a = say.onAnswer ?? true; if (a instanceof Error) throw a; return a; };
  return { cth, onAnswer, log, names: () => log.map((l) => l[0]) };
}

test('a folder answer is checked, then the card, then the record; nothing written when refused or not taken', async () => {
  // Value: protects=the folder save order and that nothing is written before the card takes it; fails_when=the record is written first or a refusal still answers the card; why_new=new save steps; seam=injected cth; no_claim=the card's React state
  const steps = [];
  const ok = fakeCth();
  const res = await FS.saveFolderAnswer('money', { path: '/Users/kelly/Money link' }, 'Statements', ok.cth, ok.onAnswer, { checked: () => steps.push('checked'), taken: () => steps.push('taken') });
  assert.deepEqual(res, { kind: 'taken', how: 'saved' });
  assert.deepEqual(ok.names(), ['foundationsCheckFolder', 'onAnswer', 'foundationsAnswerFolder']);
  assert.deepEqual(steps, ['checked', 'taken']);
  assert.match(ok.log[1][1], /^Statements\n\nI pointed the team to the folder "Money records" for this \(\/Users\/kelly\/Money records\)\./);
  assert.deepEqual(ok.log[2], ['foundationsAnswerFolder', 'money', '/Users/kelly/Money records', 'Statements'], 'the checked real path');

  const refused = fakeCth({ foundationsCheckFolder: { ok: false, error: 'empty' } });
  assert.deepEqual(await FS.saveFolderAnswer('money', { path: '/x' }, '', refused.cth, refused.onAnswer), { kind: 'refused', error: 'empty' });
  assert.deepEqual(refused.names(), ['foundationsCheckFolder']);
  const broken = fakeCth({ foundationsCheckFolder: new Error('gone') });
  assert.deepEqual(await FS.saveFolderAnswer('money', { path: '/x' }, '', broken.cth, broken.onAnswer), { kind: 'failed' });

  const notTaken = fakeCth({ onAnswer: false });
  assert.deepEqual(await FS.saveFolderAnswer('money', { path: '/x' }, '', notTaken.cth, notTaken.onAnswer), { kind: 'not-taken' });
  assert.deepEqual(notTaken.names(), ['foundationsCheckFolder', 'onAnswer']);

  const fallback = fakeCth({ foundationsAnswerFolder: { ok: false, error: 'no-office' } });
  assert.deepEqual(await FS.saveFolderAnswer('money', { path: '/x' }, '', fallback.cth, fallback.onAnswer), { kind: 'taken', how: 'michael' });
  assert.match(fallback.log.at(-1)[1].body, /\(money\): Kept in the folder \/Users\/kelly\/Money records$/);
});

test('the card offers Add a folder, takes a dropped folder, and words each refusal in three languages', () => {
  const card = read('src/renderer/src/components/FoundationCard.tsx');
  assert.match(card, /window\.cth\.foundationsPickFolder\(\)/);
  assert.match(card, /webkitGetAsEntry\?\.\(\)\?\.isDirectory/);
  assert.match(card, /file\.kind === 'folder' \? saveFolder\(file\) : saveFile\(file\)/);
  assert.match(read('src/main/index.ts'), /properties: \['openDirectory'\], title: 'Add a folder'/);
  const lines = ['addFolder', 'folderChip', 'folderMissing', 'folderTooWide', 'folderApp', 'folderMember', 'folderEmpty', 'folderTooLong'];
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const c = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).foundations.card;
    for (const k of lines) assert.ok(c[k], `${loc}: ${k}`);
    for (const k of lines.slice(2)) assert.ok(c[k].includes('{{name}}'), `${loc}: ${k} names the folder`);
  }
});
