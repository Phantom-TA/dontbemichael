'use strict';

/**
 * A voice confirm is for the team member the action was staged for. Before
 * this, with "kill Jim" waiting, "Confirm kill of Nolan" killed Jim: the confirm
 * check looked only for the verb word, never the name.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const handlers = new Map();
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) }, Notification: class { show() {} static isSupported() { return false; } } }
};

const { registerRealtimeActionIpc } = loadTs('src/main/realtimeActions.ts');

const killed = [];
const saved = [];
const agents = {
  god: { name: 'Michael', isGod: true },
  jim: { name: 'Jim' },
  nolan: { name: 'Nolan Smith' },
  jimbo: { name: 'Jim Brown' },
  closer: { name: 'The Closer' }
};
registerRealtimeActionIpc({
  hiveEnabled: () => true,
  hiveSend: () => ({}), hiveTasks: () => [], hivePatchTask: () => true,
  hiveMoveTask: () => true, hiveCloseTask: () => true,
  hiveRegistry: () => ({ godId: 'god', agents }),
  hiveLog() {}, controlPause() {}, controlSteer() {}, controlHalt() {}, controlSnapshot: () => null,
  killAgent: (id) => { killed.push(id); return { ok: true }; },
  listMissions: () => [...saved], saveMissions: (list) => { saved.splice(0, saved.length, ...list); }
});
const act = (p) => handlers.get('realtime:action')(null, p);
const confirm = (phrase) => handlers.get('realtime:action:confirm')(null, { phrase });

test('a confirm that names someone else cancels the staged action and runs nothing', async () => {
  // Value: protects=a voice kill reaches only the member it was staged for; fails_when=a confirm naming another member runs the staged one, or leaves it staged for a later phrase; why_new=found reviewing #541, "Confirm kill of Nolan" killed Jim; seam=the real ipc handlers
  for (const phrase of ['Confirm kill of Nolan', 'kill nolan', 'confirm, kill Nolan Smith', 'kill Michael']) {
    killed.length = 0;
    assert.equal((await act({ verb: 'kill', target: 'jim' })).needsConfirm, true);
    const res = await confirm(phrase);
    assert.deepEqual([res.ok, res.spoken], [false, 'That named someone other than Jim, so I cancelled the kill. Ask again for the one you mean.'], phrase);
    assert.equal((await confirm('confirm')).spoken, 'There\'s nothing waiting to confirm.', `${phrase}: nothing is left staged`);
    assert.deepEqual(killed, [], phrase);
  }
});

test('a confirm naming the staged member, or nobody, still runs it', async () => {
  for (const phrase of ['confirm', 'kill Jim', 'yes, kill jim now']) {
    killed.length = 0;
    await act({ verb: 'kill', target: 'jim' });
    const res = await confirm(phrase);
    assert.equal(res.ok, true, phrase);
    assert.deepEqual(killed, ['jim'], phrase);
  }
  // Two members share the first name Jim: naming the staged one is not someone else.
  killed.length = 0;
  await act({ verb: 'kill', target: 'jimbo' });
  assert.equal((await confirm('kill jim brown')).ok, true);
  assert.deepEqual(killed, ['jimbo']);
  // "The" in a member's name is not a name: "the" in a confirm cancels nothing.
  killed.length = 0;
  await act({ verb: 'kill', target: 'jim' });
  assert.equal((await confirm('confirm, kill the agent jim')).ok, true);
  assert.deepEqual(killed, ['jim']);
});

test('a schedule staged for one member is cancelled by a confirm that names another, and nothing is created', async () => {
  // Value: protects=a voice schedule is created only for the member it was staged for (create_schedule carries targetId too); fails_when=the schedule pending loses its targetId, so "confirm, schedule it for Nolan" creates Jim's schedule, or the cancel leaves it staged; why_new=realtime-confirm-target covers only kill; seam=none (the real ipc handlers); no_claim=none beyond protects
  saved.length = 0;
  const staged = await act({ verb: 'create_schedule', label: 'Invoice check', focus: 'Open invoices past due.', to: 'jim' });
  assert.equal(staged.needsConfirm, true);
  const res = await confirm('confirm, schedule it for Nolan');
  assert.equal(res.ok, false);
  assert.match(res.spoken, /^That named someone other than Jim, so I cancelled the create schedule\./, 'the member, never the schedule\'s label (ship review)');
  assert.equal((await confirm('schedule')).spoken, 'There\'s nothing waiting to confirm.', 'nothing is left staged');
  assert.deepEqual(saved, [], 'no schedule was created');
  // The same schedule confirmed with no other name is created, for the member it was staged for.
  await act({ verb: 'create_schedule', label: 'Invoice check', focus: 'Open invoices past due.', to: 'jim' });
  assert.equal((await confirm('confirm schedule')).ok, true);
  assert.deepEqual(saved.map((m) => [m.label, m.to]), [['Invoice check', 'jim']]);
});
