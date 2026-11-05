'use strict';

/**
 * Clocking in, clear and calm (owner, 2026-10-30, docs/designs/clocking-in-clarity.md):
 * at launch 12 engines started within 3 seconds, yet the card said 1 of 12 in,
 * because in meant first work. In now means started; the floor and Ask me wait
 * for the opening and can never be trapped by it; the card says what it waits for.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const O = loadTs('src/renderer/src/shell/clockingIn.ts');

test('a member is in once their engine has started, and real work is never overwritten', () => {
  // Value: protects=the count moves with real startup; fails_when=a start leaves the marker, a compact or clear clears it, or a busy action is wiped; why_new=owner 2026-10-30, D1; seam=source pins around the pure rule; no_claim=how fast a real engine reports
  assert.equal(O.engineStarted('SessionStart', 'startup'), true);
  assert.equal(O.engineStarted('SessionStart', 'resume'), true);
  assert.equal(O.engineStarted('SessionStart', 'compact'), false);
  assert.equal(O.engineStarted('SessionStart', 'clear'), false);
  assert.equal(O.engineStarted('SessionStart', undefined), false);
  assert.equal(O.engineStarted('PreToolUse', 'startup'), false);
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /if \(engineStarted\(e\.event, e\.source\) && self\.action === ACTION_CLOCKING_IN\) updateAgent\(e\.agentId, \{ action: '' \}\);/);
  assert.match(hive, /if \(a\.action === ACTION_CLOCKING_IN && a\.ptyId && printed\.has\(a\.ptyId\) && !usesHookStandingGoal\(a\)\) updateAgent\(a\.id, \{ action: '' \}\);/, 'an engine with no hooks: first output');
});

test('the lock can never trap: it lifts on the opening ending, Michael stopping, or the limit', () => {
  // Value: protects=a stuck start never freezes the floor and Ask me; fails_when=any reason fails to lift it, the limit moves, or a hung opening holds it; why_new=owner 2026-10-30, D4; seam=none; no_claim=real hangs
  const opening = { kind: 'opening', since: 0 };
  const t0 = 1000;
  assert.equal(O.lockEnd(opening, false, t0, t0 + 69_999), null);
  assert.equal(O.lockEnd(opening, false, t0, t0 + 70_000), 'limit');
  assert.equal(O.lockEnd(opening, true, t0, t0 + 1), 'michael-stopped');
  for (const o of [{ kind: 'done', at: 0, total: 2 }, { kind: 'short', at: 0, total: 2, missing: ['Toby'] }, { kind: 'over' }]) {
    assert.equal(O.lockEnd(o, false, t0, t0 + 1), 'opened', o.kind);
  }
  assert.equal(O.LOCK_LIMIT_MS, 70_000);
});

test('the lock covers the floor and right column only, and the card stays outside it', () => {
  // Value: protects=offices and Ask me wait, Settings stays reachable, a screen reader still hears the card; fails_when=the lock sits on stageRef (hiding the card's live region), reaches the top bar, or the end is not logged; why_new=owner 2026-10-30, D3; seam=source pins; no_claim=how it looks
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /floorRef\.current\?\.toggleAttribute\('inert', launchLock\)/);
  assert.match(app, /columnRef\.current\?\.toggleAttribute\('inert', launchLock\)/);
  assert.match(app, /<div ref=\{floorRef\} style=\{\{ display: 'contents' \}\}>\s*<StudioStage /);
  assert.doesNotMatch(app, /stageRef\.current\?\.toggleAttribute\('inert', [^)]*launchLock/);
  const clock = read('src/renderer/src/components/TeamClockingIn.tsx');
  assert.match(clock, /console\.log\(`\[opening\] floor open: \$\{end\}/);
  assert.match(read('src/renderer/src/shell/NeedsYouBoard.tsx'), /t\('shell\.answersWait'\)/);
});

test('the lock is for launch: it only ever goes off', () => {
  // Value: protects=a restore pressed during the day never takes Ask me away; fails_when=reopening the office turns the lock back on; why_new=owner 2026-10-30, D6; seam=source pins; no_claim=none beyond protects
  const store = read('src/renderer/src/store/store.ts');
  assert.match(store, /launchLock: true,\s*endLaunchLock: \(\) => set\(\{ launchLock: false \}\),/);
  assert.equal((store.match(/launchLock: true/g) || []).length, 1);
  assert.doesNotMatch(store, /reopenOffice: \(\) => set\(\{[^}]*launchLock/);
});

test('the clock starts when the opening shows, and the launch restore does not reset it', () => {
  // Value: protects=the card never says 300 seconds after first time setup, and does not jump back; fails_when=the clock reads opening.since, the launch restore restarts it, or a mid-day restore keeps an old clock; why_new=review finding; seam=none; no_claim=none beyond protects
  const first = O.openingClock(null, 5, true, 300_000);
  assert.deepEqual(first, { since: 5, at: 300_000 });
  assert.equal(O.openingClock(first, 5, true, 301_000), first);
  assert.deepEqual(O.openingClock(first, 303_000, true, 303_000), { since: 303_000, at: 300_000 }, 'the automatic restore is the same wait');
  assert.deepEqual(O.openingClock(first, 900_000, false, 900_000), { since: 900_000, at: 900_000 }, 'a mid-day restore starts its own');
});

test('the card names the slowest, and tells slow from silent without a false alarm', () => {
  // Value: protects=frozen or not reads at a glance; fails_when=the wrong member is named, the words change early, or a failed read says quiet; why_new=owner 2026-10-30, D5; seam=none; no_claim=terminal behavior of real engines
  const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
  assert.equal(O.slowestOut([a, b], new Map([['a', 5], ['b', 3]])), b);
  assert.equal(O.slowestOut([a, b], new Map([['a', 3], ['b', 3]])), a, 'roster order on a tie');
  assert.equal(O.slowestOut([c, a], new Map([['a', 3]])), a, 'first seen beats not seen');
  assert.equal(O.slowestOut([], new Map()), null);
  const now = 100_000;
  assert.equal(O.waitNote(false, 40_000, 0, now), 'time');
  assert.equal(O.waitNote(true, 29_999, 0, now), 'slowest');
  assert.equal(O.waitNote(true, 30_000, now - 14_999, now), 'longer');
  assert.equal(O.waitNote(true, 30_000, now - 15_000, now), 'quiet');
  assert.equal(O.waitNote(true, 60_000, undefined, now), 'longer', 'no reading is never quiet');
});

test('every word is there in every language, with no dashes', () => {
  // Value: protects=Chinese and Arabic offices get the new card; fails_when=a key or placeholder is missing, or a dash slips in; why_new=owner 2026-10-30; seam=none; no_claim=translation quality
  for (const loc of ['en', 'zh-CN', 'ar']) {
    const l = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`));
    const o = l.office.opening;
    for (const k of ['time', 'slowest', 'longer', 'quiet']) {
      assert.match(o.wait[k], /\{\{seconds\}\}/, `${loc} ${k}`);
      assert.doesNotMatch(o.wait[k], /[–—]| - /, `${loc} ${k}`);
      if (k !== 'time') assert.match(o.wait[k], /\{\{name\}\}/, `${loc} ${k}`);
    }
    assert.equal(typeof o.floorWaits, 'string', loc);
    assert.equal(typeof l.shell.answersWait, 'string', loc);
  }
});

test('the lock is really lifted, and the card never calls a stopped member coming', () => {
  // Value: protects=the wiring between the rule and the screen; fails_when=TeamClockingIn stops ending the lock, or a stopped member reads as still coming; why_new=ship review; seam=source pins; no_claim=rendering
  const card = read('src/renderer/src/components/TeamClockingIn.tsx');
  assert.match(card, /const end = lockEnd\(opening, michaelStopped,/);
  assert.match(card, /useStore\.getState\(\)\.endLaunchLock\(\);/);
  assert.match(card, /namesShown\(stillOut\(agents\.filter\(\(a\) => !stopped\[a\.id\]\), ACTION_CLOCKING_IN\)\)/);
  assert.match(card, /\{note && <div>/);
});

test('the time line waits a moment, so it never reads 0 seconds or names a slowest among equals', () => {
  // Value: protects=the card's first seconds; fails_when=the line shows before 5 s; why_new=ship review; seam=none; no_claim=none beyond protects
  assert.equal(O.waitNote(true, 4_999, 0, 100_000), null);
  assert.equal(O.waitNote(false, 4_999, 0, 100_000), null);
  assert.equal(O.waitNote(true, 5_000, 100_000, 100_000), 'slowest');
});

test('Start again keeps what the owner queued for Michael', () => {
  // Value: protects=the board's promise that answers wait for him; fails_when=removing his stale entry drops his queue; why_new=ship review; seam=source pin; no_claim=delivery after he starts
  const hive = read('src/renderer/src/hooks/useHive.ts');
  assert.match(hive, /const kept = michaelStartRequest > 0 \? useStore\.getState\(\)\.messageQueues\[GOD_ID\] : undefined;\s*useStore\.getState\(\)\.removeAgent\(GOD_ID\);[^\n]*\n\s*if \(kept\?\.length\) useStore\.setState/);
});
