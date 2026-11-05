'use strict';

/**
 * The top bar's Needs you pill hides while the column shows
 * (docs/designs/needs-you-pill-hides.md, owner 2026-11-05): the board, a
 * person's panel and the minimized strip each show the count, so it shows in
 * one place only. The pill's other jobs stay: the screen reader line, focus
 * back on close and the paper plane's landing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const read = (rel) => fs.readFileSync(path.resolve(__dirname, '..', rel), 'utf8');
const { pillHidden } = loadTs('src/renderer/src/shell/rightColumn.ts');

test('the pill hides exactly while the column shows', () => {
  // Value: protects=D1 (one count on screen) and that the pill is there wherever the column is not; fails_when=the pill hides on Tasks, Pulse, the graph or the case study, or shows beside an open column; why_new=owner 2026-11-05; seam=none
  for (const view of ['office', 'file']) {
    assert.equal(pillHidden('board', view), true, `board on ${view}`);
    assert.equal(pillHidden('person', view), true, `person on ${view}`);
    assert.equal(pillHidden('closed', view), false, `closed on ${view}`);
  }
  for (const view of ['tasks', 'pulse', 'graph', 'case-study']) {
    assert.equal(pillHidden('board', view), false, `${view} hides the column, so the pill shows`);
  }
  // The same views as App's own rule for where the column shows.
  assert.match(read('src/renderer/src/App.tsx'), /const columnView = floorView === 'office' \|\| floorView === 'file';/);
});

test('the pill leaves the layout but its screen reader line stays, and focus waits for it', () => {
  // Value: protects=D2 (the gap closes), E1 (a new ask is still announced) and E2 (focus lands on the pill once back); fails_when=the hidden pill keeps its space, the live region goes with it, or focus is asked before the pill exists; why_new=owner 2026-11-05; seam=source pins
  const bar = read('src/renderer/src/shell/TopBar.tsx');
  assert.match(bar, /const hidden = useStore\(\(s\) => pillHidden\(s\.rightColumn, s\.floorView\)\);\s*if \(hidden\) return live;/);
  const live = bar.indexOf('const live = <span aria-live="polite"');
  assert.ok(live > 0 && live < bar.indexOf('if (hidden) return live;'), 'the live region is built before the pill hides');
  assert.match(read('src/renderer/src/shell/rightColumn.ts'), /afterLeave\(\(\) => requestAnimationFrame\(\(\) => document\.getElementById\(NEEDS_YOU_PILL_ID\)\?\.focus\(\)\)\);/);
});

test('the board catches the paper plane while the pill is hidden', () => {
  // Value: protects=E3 (an arriving ask still shows its landing); fails_when=the board stops listening for the ping; why_new=owner 2026-11-05; seam=source pin
  const board = read('src/renderer/src/shell/NeedsYouBoard.tsx');
  assert.match(board, /window\.addEventListener\('cth:needs-you-ping', on\);/);
  assert.match(board, /<span key=\{bump\} className=\{bump \? 'cth-needs-bump' : undefined\}/);
});
