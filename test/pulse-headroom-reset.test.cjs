'use strict';

/**
 * Pulse's plan bar reads the most constrained usage window from the last
 * status line (team-performance.md, E6). A window that has reset since then
 * says nothing about the plan now, so it is not shown: a quiet office would
 * otherwise show the plan used up, with its "runs out" warning, for hours.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { PulseService } = loadTs('src/main/pulse.ts');

const H = 3_600_000;

function service(clock) {
  const db = { prepare: () => ({ all: () => [], run: () => ({}) }) };
  const processor = {
    firstDay: () => '2026-10-01', days: () => [], cards: () => [], decisions: () => [],
    michaelCounts: () => ({ cardsOpened: 0 }), safetyRows: () => [], runs: () => [],
    firstNoteAdded: () => null, notesAdded: () => []
  };
  return new PulseService({
    db: () => db, store: { failureDays: () => [], record() {} }, processor,
    office: () => '/office', members: () => [], godId: () => null, tasks: () => [], missions: () => [],
    models: () => [], ladder: () => [], priceOf: () => undefined, applyMissions: () => ({ ok: true }),
    billing: () => 'account', plan: () => null, memory: () => ({ notes: [], procedures: {} }), now: () => clock.now
  });
}

test('a usage window that has reset since the last status line is not shown', () => {
  // Value: protects=a quiet office's plan bar never shows a reset window as used up; fails_when=the reading is kept past its resetsAt; why_new=headroom stayed at 95% with a past reset time until an agent printed a status line; seam=none
  const clock = { now: new Date(2026, 9, 20, 14, 0).getTime() };
  const svc = service(clock);
  svc.noteRateLimits({ five_hour: { used_percentage: 95, resets_at: (clock.now + H) / 1000 } }, clock.now);
  assert.equal(svc.snapshot('today').headroom.usedPct, 95, 'a live window is shown');
  clock.now += 4 * H;
  assert.equal(svc.snapshot('today').headroom, null, 'reset three hours ago');
  svc.noteRateLimits({ five_hour: { used_percentage: 10, resets_at: (clock.now + H) / 1000 } }, clock.now);
  assert.equal(svc.snapshot('today').headroom.usedPct, 10, 'the next status line is shown again');
});
