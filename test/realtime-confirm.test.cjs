'use strict';

// A destructive voice action waits for a confirm that names the verb or says
// "confirm" (src/main/realtimeActions.ts). A phrase that carries the verb but
// says no ("no, don't kill Jim", "cancel the kill") must not run it.

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
registerRealtimeActionIpc({
  hiveEnabled: () => true,
  hiveSend: () => ({}), hiveTasks: () => [], hivePatchTask: () => true,
  hiveMoveTask: () => true, hiveCloseTask: () => true,
  hiveRegistry: () => ({ godId: 'god', agents: { god: { name: 'Michael', isGod: true }, jim: { name: 'Jim' } } }),
  hiveLog() {}, controlPause() {}, controlSteer() {}, controlHalt() {}, controlSnapshot: () => null,
  killAgent: (id) => { killed.push(id); return { ok: true }; },
  listMissions: () => [], saveMissions() {}
});
const act = (p) => handlers.get('realtime:action')(null, p);
const confirm = (phrase) => handlers.get('realtime:action:confirm')(null, { phrase });

test('a confirm that says no never runs the action', async () => {
  // Value: protects=stray or refusing speech can't kill, pause or archive an agent; fails_when=a phrase with the verb word and a no, not, don't or cancel is accepted; why_new=the check only looked for the verb word; seam=none
  for (const phrase of ["no, don't kill jim", 'cancel the kill', 'I do not confirm', 'don’t kill him', 'wait, kill? no', 'stop, not the kill']) {
    killed.length = 0;
    assert.equal((await act({ verb: 'kill', target: 'jim' })).needsConfirm, true);
    const res = await confirm(phrase);
    assert.equal(res.ok, false, phrase);
    assert.deepEqual(killed, [], phrase);
  }
});

test('a plain confirm still runs it, and a bare yes still does not', async () => {
  // Value: protects=the owner can still confirm by voice; fails_when=the no words catch an ordinary confirm; why_new=the no words; seam=none
  killed.length = 0;
  await act({ verb: 'kill', target: 'jim' });
  assert.equal((await confirm('yes')).ok, false);
  assert.equal((await confirm('yes, kill jim now')).ok, true);
  assert.deepEqual(killed, ['jim']);
  killed.length = 0;
  await act({ verb: 'kill', target: 'jim' });
  assert.equal((await confirm('confirm')).ok, true);
  assert.deepEqual(killed, ['jim']);
});

test('every way of saying no refuses, and a refused confirm is dropped, not left armed', async () => {
  // Value: protects=a no in any form ends a staged kill for good; fails_when=a n't word other than don't, cannot, a curly ‘ or nah, hold on or nevermind is accepted, or a refused kill still runs on the next phrase with the verb word; why_new=review on #541; seam=the real handlers through the ipcMain stub
  const phrases = [
    "I can't kill Jim", "I won't kill Jim", "I didn't mean kill jim", "you shouldn't kill jim", "I couldn't kill jim",
    'I cannot kill Jim', 'cant kill jim', 'wont kill jim', 'don‘t kill jim',
    'nah, kill Jim', 'hold on, kill Jim', 'hang on, kill jim', 'hold off, kill jim', 'nevermind, kill Jim'
  ];
  for (const phrase of phrases) {
    killed.length = 0;
    await act({ verb: 'kill', target: 'jim' });
    const res = await confirm(phrase);
    assert.deepEqual([res.ok, res.spoken], [false, 'Cancelled the kill.'], phrase);
    assert.deepEqual(killed, [], phrase);
  }
  // The staged kill is gone: a later phrase with the verb word finds nothing to run.
  killed.length = 0;
  await act({ verb: 'kill', target: 'jim' });
  assert.equal((await confirm('cancel the kill')).spoken, 'Cancelled the kill.');
  assert.equal((await confirm('jim can kill that bug')).spoken, 'There\'s nothing waiting to confirm.');
  assert.deepEqual(killed, []);
  // A bare yes still keeps it staged, so a clear confirm after it works.
  await act({ verb: 'kill', target: 'jim' });
  assert.equal((await confirm('yes')).ok, false);
  assert.equal((await confirm('kill jim')).ok, true);
  assert.deepEqual(killed, ['jim']);
});
