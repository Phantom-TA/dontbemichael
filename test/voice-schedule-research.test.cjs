'use strict';

// Research gets no schedules (docs/designs/research-agent-privacy.md D19):
// a voice create_schedule for the Research member is refused and nothing is
// saved, as missions:upsert and agent schedule requests already refuse it.

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

test('voice gives the Research member no schedule, and another member still gets one', async () => {
  let missions = [];
  registerRealtimeActionIpc({
    hiveEnabled: () => true,
    hiveSend: () => ({ id: 'x' }),
    hiveTasks: () => ({ tasks: [] }),
    hiveRegistry: () => ({ godId: 'god', agents: { god: { name: 'Michael', isGod: true }, research: { name: 'Pete' }, jim: { name: 'Jim' } } }),
    hiveLog() {},
    listMissions: () => missions,
    saveMissions: (m) => { missions = m; }
  });
  const act = (p) => handlers.get('realtime:action')(null, p);
  const confirm = () => handlers.get('realtime:action:confirm')(null, { phrase: 'confirm' });
  const job = { verb: 'create_schedule', label: 'Competitor prices', focus: 'Look up competitor prices.', intervalMinutes: 60 };

  for (const to of ['Pete', 'research']) {
    const r = await act({ ...job, to });
    assert.deepEqual([r.ok, r.needsConfirm], [false, undefined], to);
    assert.equal(r.spoken, 'Pete has no schedules. They answer the questions teammates send them.');
    assert.equal((await confirm()).spoken, 'There\'s nothing waiting to confirm.');
  }
  assert.deepEqual(missions, [], 'nothing saved');

  const r = await act({ ...job, to: 'Jim' });
  assert.deepEqual([r.ok, r.needsConfirm], [true, true], r.spoken);
  assert.equal((await confirm()).ok, true);
  assert.deepEqual(missions.map((m) => [m.label, m.to]), [['Competitor prices', 'jim']]);
});
