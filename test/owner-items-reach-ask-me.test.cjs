'use strict';

/**
 * Items for the owner reach Ask me (docs/designs/owner-items-reach-ask-me.md,
 * owner 2026-11-05). An App Store rejection reached Nick, who told Michael
 * "for the owner, no filing", and Michael wrote it only in his terminal. Now
 * members file every item for the owner (an ask, an action or a notice), the
 * bar keeps routine email off the board, notice cards teach the member what
 * to skip, and three Got its in a row bring a "keep showing these?" question.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};
const { HiveManager } = loadTs('src/main/hive.ts');
const N = loadTs('src/shared/noticeCards.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const KIND = 'App Store review result';

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-owner-items-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home, () => true);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'nick', name: 'Nick', provider: 'claude', cwd: home });
  hive.commit = () => {};
  const inbox = path.join(home, 'hive', 'agents', 'god', 'inbox');
  const toMichael = () => fs.readdirSync(inbox).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8')));
  return { hive, toMichael };
}

const notice = (id, kind = KIND, extra = {}) => ({
  id, title: `Notice ${id}`, status: 'done', assignee: 'nick',
  humanQA: [{ kind: 'report', ...(kind ? { noticeKind: kind } : {}), q: `**${id}**`, askedAt: '2026-11-05T10:00:00.000Z', raisedBy: 'nick', ...extra }]
});

test('the Got it count runs per member and kind, and Don\'t show me these ends it', () => {
  // Value: protects=D2 (Michael asks after three Got its in a row of one kind); fails_when=kinds from different members or with other names count together, case splits one kind, or a skip does not reset the run; why_new=owner 2026-11-05; seam=none
  const cleared = (by, kind, at, reason) => ({ assignee: by, humanQA: [{ kind: 'report', noticeKind: kind, raisedBy: by, dismissedBy: 'owner', dismissedAt: at, dismissedReason: reason }] });
  const cards = [
    cleared('nick', KIND, '2026-11-01T00:00:00Z', N.GOT_IT),
    cleared('nick', 'app store REVIEW result', '2026-11-02T00:00:00Z', N.NOT_NEEDED),
    cleared('nick', KIND, '2026-11-03T00:00:00Z', N.GOT_IT),
    cleared('nick', 'App Store  review result ', '2026-11-04T00:00:00Z', N.GOT_IT),
    cleared('pam', KIND, '2026-11-04T12:00:00Z', N.GOT_IT),
    cleared('nick', 'Domain renewal', '2026-11-05T00:00:00Z', N.GOT_IT)
  ];
  assert.equal(N.gotItStreak(cards, 'nick', KIND), 2, 'the skip on 2 Nov ends the earlier run; Pam\'s and other kinds are apart');
  assert.equal(N.gotItStreak(cards, 'pam', KIND), 1);
  assert.equal(N.noticeKindOf({ noticeKind: 7 }), '', 'a kind is words or nothing');
  assert.equal(N.GOT_IT_STREAK, 3);
});

test('the Got it count names the raiser the clear names, so a member who left counts as Michael', () => {
  // Value: protects=the Got it run counts under the id ackReport resolves (raiserOf), TODOS "Small board timing edges"; fails_when=a notice whose raiser and assignee left the team counts under the old id while the clear names Michael, or a stale raisedBy does not fall back to the assignee; why_new=red team pass 2, 2026-11-05; seam=none
  const cleared = (assignee, raisedBy, at) => ({ assignee, humanQA: [{ kind: 'report', noticeKind: KIND, ...(raisedBy ? { raisedBy } : {}), dismissedBy: 'owner', dismissedAt: at, dismissedReason: N.GOT_IT }] });
  const team = new Set(['god', 'nick']);
  const cards = [
    cleared('kevin', 'kevin', '2026-11-01T00:00:00Z'),
    cleared('kevin', undefined, '2026-11-02T00:00:00Z'),
    cleared('god', 'kevin', '2026-11-03T00:00:00Z'),
    cleared('nick', 'typo', '2026-11-04T00:00:00Z'),
    cleared('nick', 'nick', '2026-11-05T00:00:00Z')
  ];
  assert.equal(N.gotItStreak(cards, 'god', KIND, team), 3, 'Kevin left: his three count as Michael, as their clears did');
  assert.equal(N.gotItStreak(cards, 'kevin', KIND, team), 0, 'never under the old id');
  assert.equal(N.gotItStreak(cards, 'nick', KIND, team), 2, 'a mistyped raisedBy falls back to the assignee');
  assert.equal(N.gotItStreak(cards, 'kevin', KIND), 3, 'with no team given, every id counts');
});

test('three Got its in a row tell Michael once to ask whether to keep showing them', async (t) => {
  // Value: protects=D2 and B5 (data backed proposals, never a silent skip, never asked twice); fails_when=Michael is not told, is told on the second, or is told again on the fourth; why_new=owner 2026-11-05; seam=real HiveManager on a temp office
  const { hive, toMichael } = await office(t);
  hive.writeTasks([notice('n1'), notice('n2'), notice('n3'), notice('n4'), notice('job', '')]);
  const asked = () => toMichael().filter((m) => m.subject === `Notices cleared: ${KIND}`);
  assert.equal(hive.ackReport('n1', 0), true);
  assert.equal(hive.ackReport('n2', 0), true);
  assert.equal(asked().length, 0, 'not on the second');
  assert.equal(hive.ackReport('n3', 0), true);
  assert.equal(asked().length, 1, 'on the third');
  assert.match(asked()[0].body, /"raisedBy": "nick"/);
  assert.match(asked()[0].body, /"Keep showing them" and "Stop showing them"/);
  // A board tick between Got its keeps the record (ship review, 2026-11-05).
  hive.refreshOwnerRequests();
  assert.equal(hive.ackReport('n4', 0), true);
  assert.equal(asked().length, 1, 'once per member and kind, across a board tick');
  assert.equal(hive.ackReport('n1', 0), false, 'a cleared notice cannot be cleared again');
  assert.equal(hive.ackReport('job', 0), true, 'a scheduled job report still clears with Got it');
  assert.equal(hive.tasks().tasks.find((c) => c.id === 'job').humanQA[0].dismissedReason, N.GOT_IT);
});

test('a failed note is asked again, and a stale raisedBy counts for the card\'s member', async (t) => {
  // Value: protects=Michael is asked to keep showing a kind even when the first note could not be written, and the count names the same member the card does (ship review, 2026-11-05); fails_when=the key is recorded before the send, or a mistyped raisedBy splits the count; why_new=both found in review; seam=real HiveManager with its send made to fail once
  const { hive, toMichael } = await office(t);
  const stale = (id) => notice(id, KIND, { raisedBy: 'nicky' });
  hive.writeTasks([stale('n1'), stale('n2'), stale('n3'), stale('n4')]);
  const asked = () => toMichael().filter((m) => m.subject === `Notices cleared: ${KIND}`);
  hive.ackReport('n1', 0);
  hive.ackReport('n2', 0);
  const send = hive.send;
  hive.send = () => { throw new Error('the disk is full'); };
  assert.equal(hive.ackReport('n3', 0), true, 'the clear itself stands');
  hive.send = send;
  assert.equal(asked().length, 0);
  hive.ackReport('n4', 0);
  assert.equal(asked().length, 1, 'asked on the next Got it');
  assert.match(asked()[0].body, /"raisedBy": "nick"/, 'the card\'s member, not the unknown id');
});

test('Don\'t show me these clears the notice, teaches the member, and tells Michael', async (t) => {
  // Value: protects=D2 and B2 (the owner's skip reaches the member's memory); fails_when=the note is not kept, Michael is not told, or a report with no kind (a scheduled job's) can be skipped; why_new=owner 2026-11-05; seam=real HiveManager and owner notes on a temp office
  const { hive, toMichael } = await office(t);
  hive.writeTasks([notice('n1'), notice('job', '')]);
  assert.equal(hive.skipNotice('job', 0), false, 'only a notice names a kind to stop');
  assert.equal(hive.skipNotice('n1', 0), true);
  const entry = hive.tasks().tasks.find((c) => c.id === 'n1').humanQA[0];
  assert.equal(entry.dismissedReason, N.NOT_NEEDED);
  assert.equal(entry.dismissedBy, 'owner');
  const [note] = hive.ownerNotes.pending('nick');
  assert.match(note.text, /don't show me notices of this kind: "App Store review result"\. Stop filing them/);
  assert.equal(toMichael().filter((m) => m.subject === `Notices not needed: ${KIND}`).length, 1);
  // Michael keeps it too, so he makes no card for that kind from Nick's report.
  const [mine] = hive.ownerNotes.pending('god');
  assert.match(mine.text, /don't show me notices of this kind from Nick: "App Store review result"\. Make no card for them, even when they show up in Nick's report\./);
  assert.equal(hive.skipNotice('n1', 0), false, 'once');
  assert.equal(hive.tasks().tasks.find((c) => c.id === 'job').humanQA[0].dismissedAt, undefined, 'a refused skip leaves the job report open');
});

test('members file every item for the owner, under a bar, and Michael never leaves one in his terminal', () => {
  // Value: protects=B1 to B5, the agent behavior changes; fails_when=a rule is dropped or reworded so items for the owner can go only in a message or a terminal, or the bar that keeps routine email off the board goes; why_new=owner 2026-11-05 (App Store rejection lost); seam=source pins of the prompt text; no_claim=whether agents follow it (no eval)
  const hive = read('src/main/hive.ts');
  const bar = 'money moving, a deadline, a customer or partner waiting, a platform rejecting or suspending something of ours, security or legal';
  // Members (B1, B2).
  assert.ok(hive.includes('"action": "<what only the owner can do, and by when if the email says>"; "notice": "<what the owner should know, and why it matters>"'));
  assert.ok(hive.includes('Anything for the owner goes in a filing, never only in a message to ${michael}'));
  assert.ok(hive.includes(`File a notice only when it carries a real consequence: ${bar}. Receipts, renewals that need nothing, promotions and routine status stay in your records`));
  assert.ok(hive.includes('Never file a notice of a kind the owner said not to show; your memory keeps those.'));
  // Michael (B3, B4, B5).
  assert.ok(hive.includes("Nothing meant for the owner goes only in your terminal, which the owner never reads"));
  assert.ok(hive.includes(`a notice with a real consequence (${bar}), make the card yourself as for a filing`));
  assert.ok(hive.includes('A routine notice below that bar get'));
  assert.match(hive, /An "action" becomes a "blocked" card whose ask says what to do, with the link the filing gives, and the options "Done, I did it" \(recommended\), "Not yet" with "later": true, and "I need help"/);
  assert.match(hive, /A "notice" becomes a report: [^\n]*"kind": "report", "noticeKind": "<the filing\\'s noticeKind>"/);
  assert.ok(hive.includes('When the app tells you the owner cleared several notices of one kind in a row ("Notices cleared"), ask the owner as it says.'));
  // The protocol every member reads.
  assert.match(hive, /with one of \\`"ask"\\` [^\n]*\\`"action"\\` \(something only the owner can do\), \\`"notice"\\`/);
  assert.ok(hive.includes('Anything for the owner is filed, never only said in a message to Michael'));
  for (const s of [bar, 'Anything for the owner goes in a filing']) assert.doesNotMatch(s, /[–—]| - /);
});

test('the notice card offers Don\'t show me these, from the app page only', () => {
  // Value: protects=D2 on the owner's side, and that only the app's page writes the owner's word into a member's memory; fails_when=the button is lost, shows on a scheduled job's report, or the route drops its page check; why_new=owner 2026-11-05; seam=source pins plus locales
  const tab = read('src/renderer/src/components/AskMeTab.tsx');
  assert.match(tab, /\{isReport\(open\) && !!noticeKindOf\(open\) && \(/);
  assert.match(tab, /void window\.cth\.skipNotice\(t\.id, row\.index\)\.then\(\(\) => refreshNeedsYou\(\)\)/);
  const main = read('src/main/index.ts');
  assert.match(main, /ipcMain\.handle\('hive:skipNotice', \(evt, taskId: unknown, index: unknown\) => \(\{\n  ok: fromAppPage\(evt\) && typeof taskId === 'string'/);
  assert.match(read('src/preload/index.ts'), /skipNotice: \(taskId: string, index: number\): Promise<\{ ok: boolean \}> => ipcRenderer\.invoke\('hive:skipNotice', taskId, index\)/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const v = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).askMe.skipNotice;
    assert.ok(v, loc);
    assert.doesNotMatch(v, /[–—]/, loc);
  }
});
