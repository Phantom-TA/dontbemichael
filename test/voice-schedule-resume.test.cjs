'use strict';

// A paused schedule turned back on by voice waits for its next slot, as it
// does from the Schedules tab (setMissionEnabled), instead of running the
// slot it missed while it was off.

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
const { armPlan, setMissionEnabled } = loadTs('src/shared/missions.ts');

const ctx = { standupId: 'standup', standupFiredThisLaunch: true };

test('a schedule turned back on by voice waits for its next slot', async () => {
  const start = Date.now();
  const slot = new Date(start - 60 * 60_000); // its daily slot was an hour ago
  const paused = {
    id: 'report', label: 'Morning report', intervalMs: 86_400_000, to: 'god', body: '', focus: 'Sales',
    enabled: false, weekly: { days: [0, 1, 2, 3, 4, 5, 6], minute: slot.getHours() * 60 + slot.getMinutes() },
    lastFiredAt: start - 3 * 86_400_000, scheduledSince: start - 10 * 86_400_000, createdBy: 'owner'
  };
  let missions = [paused, { id: 'other', label: 'Other job', intervalMs: 3_600_000, to: 'god', body: '', enabled: true, createdBy: 'owner' }];
  registerRealtimeActionIpc({
    hiveEnabled: () => true,
    hiveSend: () => ({ id: 'x' }),
    hiveTasks: () => ({ tasks: [] }),
    hiveRegistry: () => ({ godId: 'god', agents: { god: { name: 'Michael', isGod: true } } }),
    hiveLog() {},
    listMissions: () => missions,
    saveMissions: (m) => { missions = m; }
  });
  const act = (p) => handlers.get('realtime:action')(null, p);
  const confirm = () => handlers.get('realtime:action:confirm')(null, { phrase: 'confirm' });

  assert.equal((await act({ verb: 'edit_schedule', missionId: 'Morning report', action: 'enable' })).needsConfirm, true);
  assert.equal((await confirm()).spoken, 'Enabled the "Morning report" schedule.');
  const on = missions.find((m) => m.id === 'report');
  assert.equal(on.enabled, true);
  assert.ok(on.scheduledSince >= start, 'turning it on stamps scheduledSince');

  const now = Date.now();
  const plan = armPlan(on, now, ctx);
  assert.equal(plan.type, 'weekly');
  assert.ok(plan.firstDelayMs > 0, 'the missed slot does not run now');
  assert.equal(plan.firstDelayMs, armPlan(setMissionEnabled([paused], 'report', true, now)[0], now, ctx).firstDelayMs, 'the same next slot as the Schedules tab');

  // Off and delete work as before.
  await act({ verb: 'edit_schedule', missionId: 'Morning report', action: 'disable' });
  assert.equal((await confirm()).spoken, 'Disabled the "Morning report" schedule.');
  assert.equal(missions.find((m) => m.id === 'report').enabled, false);
  await act({ verb: 'edit_schedule', missionId: 'Morning report', action: 'delete' });
  assert.equal((await confirm()).spoken, 'Deleted the "Morning report" schedule.');
  assert.deepEqual(missions.map((m) => m.id), ['other']);
});
