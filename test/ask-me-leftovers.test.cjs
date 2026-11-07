'use strict';

/**
 * Nothing left unresolved on Ask me (docs/designs/ask-me-leftovers.md, owner
 * 2026-11-05). On GammaTile the owner answered one question of three, and the
 * other two, Ellah's new meeting time among them, waited two days with no
 * decision anywhere. Now each question the owner leaves open, unanswered or
 * "Not yet", is a leftover that gets a recorded decision; the app lists any
 * without one to Michael every turn, with no time limit, and brings a later
 * one back at its time, however far off.
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
const L = loadTs('src/shared/askLeftovers.ts');
const { stuckCardsContext } = loadTs('src/shared/ownerRequests.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

// The GammaTile ask of 28 Oct, as the owner answered it on 31 Oct.
const gamma = {
  q: '**The GammaTile call didn\'t happen, and Ellah Foster wants to reschedule this week.**',
  askedAt: '2026-10-29T01:43:00Z', raisedBy: 'dwight',
  parts: [
    { q: 'Rescheduling: will you reply to Ellah yourself, or should Dwight offer times this week?', options: [{ label: 'I\'ll reply myself' }, { label: 'Dwight offers Thu 29 or Fri 30 Oct' }] },
    { q: 'Please save Ellah\'s attachment into the Sales folder.', options: [{ label: 'Done, I did it' }, { label: 'Not yet' }] },
    { q: 'Does the new workflow come out of the 20 hours?', options: [{ label: 'Use the 20 hours' }, { label: 'Needs its own quote' }] }
  ],
  a: '2: Not yet. Not answered: 1, 3', answeredAt: '2026-10-31T05:45:06.600Z', partAnswers: [null, 'Not yet', null]
};

test('every question the owner left open is a leftover, Not yet included', () => {
  // Value: protects=D1 and D3 (unanswered and Not yet questions are caught, settled ones are not); fails_when=a Not yet counts as settled, an unanswered part is missed, or a plain answer is mistaken for one; why_new=owner 2026-11-05 (GammaTile); seam=none
  assert.deepEqual(L.leftoversOf(gamma), [1, 2, 3], 'all three: two unanswered, one Not yet');
  assert.deepEqual(L.leftoversOf({ ...gamma, partAnswers: ['I\'ll reply myself', 'Done, I did it', 'Use the 20 hours (both)'] }), []);
  const todo = { q: '**Please send the invite.**', options: [{ label: 'Done, I did it' }, { label: 'Later please', later: true }], a: 'Picked: Later please', picked: 1, answeredAt: '2026-11-05T10:00:00Z' };
  assert.deepEqual(L.leftoversOf(todo), [1], 'a later option on a single question');
  assert.deepEqual(L.leftoversOf({ ...todo, picked: 0, a: 'Picked: Done, I did it' }), []);
  assert.deepEqual(L.leftoversOf({ q: 'Which date?', a: 'Friday', answeredAt: '2026-11-05T10:00:00Z' }), [], 'a typed answer settles it');
  assert.deepEqual(L.leftoversOf({ ...gamma, a: undefined, answeredAt: undefined }), [], 'an open question is not a leftover yet');
  assert.deepEqual(L.leftoversOf({ ...gamma, partAnswers: undefined }), [], 'an answer from before parts were recorded is left alone');
});

test('a decision needs a reason, and a later one a time; the last one for a question wins', () => {
  // Value: protects=D2 (a recorded decision, never a silent default; any horizon allowed); fails_when=a decision with no reason or a later with no readable time counts, or a revised decision is ignored; why_new=owner 2026-11-05; seam=none
  const decided = { ...gamma, leftovers: [
    { question: 1, decision: 'now', why: 'Ellah is waiting on a time this week' },
    { question: 2, decision: 'later', why: 'Saved once the call is set', at: '2027-02-05T09:00:00-06:00' },
    { question: 3, decision: 'dropped' },
    { question: 3, decision: 'later', why: 'no time' },
    { question: 2, decision: 'later', why: 'Three months out is fine', at: '2027-02-05T09:00:00-06:00' }
  ] };
  assert.deepEqual(L.undecidedLeftovers(decided), [3], 'question 3 has no usable decision');
  assert.equal(L.decisionsOf(decided).get(2).why, 'Three months out is fine');
});

test('Michael sees every leftover with no decision each turn, with no time limit', () => {
  // Value: protects=the guarantee that nothing unresolved is dropped, without forcing a deadline; fails_when=an undecided leftover is not listed, a decided one still is, or answers from before this existed are dragged back; why_new=owner 2026-11-05; seam=none
  const since = Date.parse('2026-10-01T00:00:00Z');
  const cards = [
    { id: 'kelly-gammatile-coe-stage', title: 'GammaTile: Houston Methodist COE', assignee: 'dwight', status: 'todo', humanQA: [gamma] },
    { id: 'done-one', title: 'Decided', status: 'done', humanQA: [{ ...gamma, leftovers: [1, 2, 3].map((n) => ({ question: n, decision: 'dropped', why: 'settled on the call' })) }] }
  ];
  const stuck = L.leftoversToDecide(cards, since);
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].issue, 'leftovers');
  assert.match(stuck[0].leftovers, /questions 1, 2, 3 of the answer at 2026-10-31T05:45:06\.600Z/);
  const said = stuckCardsContext(stuck);
  assert.match(said, /^LEFTOVER QUESTIONS WITHOUT A DECISION\./);
  assert.match(said, /There is no time limit on deciding/);
  assert.match(said, /- card kelly-gammatile-coe-stage: GammaTile: Houston Methodist COE \(with dwight\): questions 1, 2, 3/);
  assert.deepEqual(L.leftoversToDecide(cards, Date.parse('2026-11-01T00:00:00Z')), [], 'an answer from before the check began is left alone');
});

async function office(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-leftovers-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home, () => true);
  await hive.ensureAgent({ id: 'god', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  hive.commit = () => {};
  const inbox = path.join(home, 'hive', 'agents', 'god', 'inbox');
  const toMichael = () => fs.readdirSync(inbox).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(inbox, f), 'utf8')));
  return { hive, toMichael };
}

test('a later leftover comes back to Michael at its time, once, even on a Done card', async (t) => {
  // Value: protects=D2 (a later decision really returns, however far off, and is never lost when the card closes); fails_when=the app misses a due one, tells twice, tells early, or skips a Done card; why_new=owner 2026-11-05; seam=real HiveManager board tick on a temp office
  const { hive, toMichael } = await office(t);
  const past = '2026-11-01T09:00:00-06:00';
  const future = '2099-01-01T09:00:00-06:00';
  hive.writeTasks([{ id: 'g1', title: 'GammaTile', status: 'done', assignee: 'dwight', humanQA: [{ ...gamma, leftovers: [
    { question: 1, decision: 'now', why: 'Ellah is waiting' },
    { question: 2, decision: 'later', why: 'Save it once the call is set', at: past },
    { question: 3, decision: 'later', why: 'Decide after the call', at: future }
  ] }] }]);
  const due = () => toMichael().filter((m) => m.subject === 'Leftover question due: card g1');
  // A failed write is tried again on the next tick, never lost (ship review, 2026-11-05).
  const route = hive.routeMessage;
  hive.routeMessage = () => { throw new Error('the disk is full'); };
  hive.refreshOwnerRequests();
  hive.routeMessage = route;
  assert.equal(due().length, 0);
  hive.refreshOwnerRequests();
  assert.equal(due().length, 1, 'question 2 is due; question 3 is far off');
  assert.match(due()[0].body, /ask it again on a new card, since that card is done/, 'a Done card stays done');
  assert.match(due()[0].body, /The question: "Please save Ellah's attachment into the Sales folder\."/);
  assert.match(due()[0].body, /Why it was kept for later: Save it once the call is set\./);
  hive.refreshOwnerRequests();
  assert.equal(due().length, 1, 'told once');
  // A revised time is a new reminder.
  const board = hive.tasks();
  board.tasks[0].humanQA[0].leftovers.push({ question: 2, decision: 'later', why: 'Still not set', at: '2026-11-03T09:00:00-06:00' });
  hive.writeTasks(board.tasks);
  hive.refreshOwnerRequests();
  assert.equal(due().length, 2);
  assert.match(L.leftoverDueNote({ key: 'k', taskId: 'c1', title: 'T', question: 1, q: 'Q?', why: 'w', at: past, done: false }).body, /ask it again on the same card \(move the card to "blocked" with the ask\)/);
});

test('a leftover due in the tick an agent reopens a Done card is worded for the Done card', async (t) => {
  // Value: protects=dueLeftovers reads the board with the guard's fixes, as dueReminders does (TODOS "Small board timing edges"); fails_when=the note says "ask it again on the same card" for a card the guard puts back in Done, or a deleted Done card's due leftover is missed; why_new=red team pass 2, 2026-11-05; seam=real HiveManager board tick on a temp office
  const { hive, toMichael } = await office(t);
  const later = { ...gamma, leftovers: [{ question: 2, decision: 'later', why: 'Save it once the call is set', at: new Date(Date.now() + 400).toISOString() }] };
  hive.writeTasks([
    { id: 'g1', title: 'GammaTile', status: 'done', assignee: 'dwight', humanQA: [later] },
    { id: 'g2', title: 'Gone', status: 'done', assignee: 'dwight', humanQA: [later] }
  ]);
  hive.refreshOwnerRequests();
  // The guard has seen both Done and nothing is due yet. Then the time comes,
  // and before the next tick an agent reopens g1 and deletes g2.
  await new Promise((r) => setTimeout(r, 500));
  hive.writeTasks([{ id: 'g1', title: 'GammaTile', status: 'doing', assignee: 'dwight', humanQA: [later] }]);
  hive.refreshOwnerRequests();
  const due = (id) => toMichael().filter((m) => m.subject === `Leftover question due: card ${id}`);
  assert.equal(hive.tasks().tasks.find((c) => c.id === 'g1').status, 'done', 'the guard put it back');
  assert.equal(due('g1').length, 1);
  assert.match(due('g1')[0].body, /ask it again on a new card, since that card is done/);
  assert.equal(due('g2').length, 1, 'a deleted Done card that comes back keeps its leftover');
  assert.match(due('g2')[0].body, /since that card is done/);
});

test('the leftover check keeps its start across a restart', async (t) => {
  // Value: protects=an answer given after the check began is still listed after the app restarts; fails_when=the start is not saved or is reset at each launch; why_new=coverage audit, 2026-11-05 (was a source pin); seam=two real HiveManagers on one temp office
  const { hive } = await office(t);
  hive.writeTasks([]);
  hive.refreshOwnerRequests();
  const home = hive.getHome();
  const saved = fs.readFileSync(path.join(home, 'private', 'leftovers-since.json'), 'utf8');
  const answeredAt = new Date(Date.parse(JSON.parse(saved).since) + 60_000).toISOString();
  const again = new HiveManager(() => home, () => true);
  again.commit = () => {};
  again.writeTasks([{ id: 'g1', title: 'GammaTile', status: 'todo', assignee: 'dwight', humanQA: [{ ...gamma, answeredAt }] }]);
  again.refreshOwnerRequests();
  assert.equal(fs.readFileSync(path.join(home, 'private', 'leftovers-since.json'), 'utf8'), saved, 'the same start');
  assert.ok(again.stuckCards().some((c) => c.issue === 'leftovers' && c.id === 'g1'), 'the answer is still listed');
});

test('members decide each leftover, Michael records it, Not yet brings a question back, and Michael reads the history when asked', () => {
  // Value: protects=B1 to B5, the agent behavior changes; fails_when=a rule is dropped or reworded so a leftover can be left with no decision, a deadline is forced, Not yet stops bringing a question back, or Michael is not pointed at the card's history; why_new=owner 2026-11-05 (GammaTile); seam=source pins of the prompt text; no_claim=whether agents follow it (no eval)
  const hive = read('src/main/hive.ts');
  assert.ok(hive.includes('decide each one, weighing who is waiting and any deadline: dropped (it no longer matters; say why), settled (you answered it yourself; say how), now (it still needs the owner now: file it again, as it was or reworded to what you now know), or later (it needs the owner, but not yet: give the date and time it should come back, however far off, and why)'));
  assert.ok(hive.includes('nothing the owner left open is ever just left'));
  assert.ok(hive.includes('you record that on the answered question as "leftovers"; the app lists each one without a decision to you every turn, and tells you when a later one comes due.'));
  assert.ok(hive.includes('such as "Not yet" with "later": true, which brings the question back at a time the office chooses'));
  assert.ok(hive.includes("When the owner asks why a question changed or left Ask me, read that card\\'s whole history before answering"));
  assert.ok(hive.includes('Nothing the owner left open is ever just left.'), 'the protocol every member reads');
  assert.doesNotMatch(hive, /within \d+ hours?/i, 'no fixed time to decide');
});
