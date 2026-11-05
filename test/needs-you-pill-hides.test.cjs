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

test('the pill eases out of the layout and back, its screen reader line stays, and focus waits for it', () => {
  // Value: protects=D2 (the gap closes), smooth hiding (owner, 2026-11-05: "it should smooth animate"), E1 (a new ask is still announced) and E2 (focus lands on the pill once back); fails_when=the hidden pill keeps its space, jumps instead of easing, stays reachable while hidden, loses the live region, or focus is asked before the pill exists; why_new=owner 2026-11-05; seam=source pins (the easing was measured in Electron)
  const bar = read('src/renderer/src/shell/TopBar.tsx');
  assert.match(bar, /const hidden = useStore\(\(s\) => pillHidden\(s\.rightColumn, s\.floorView\)\);/);
  assert.match(bar, /const slot = \(body: ReactNode\) => \(<>\{live\}/, 'every state keeps the live region beside the pill');
  assert.match(bar, /className="cth-pill-slot"\s*data-hidden=\{hidden \|\| undefined\}/);
  assert.match(bar, /<span className="cth-pill-face" style=\{\{ display: 'inline-flex' \}\}>\{body\}<\/span>/, 'the fade is its own layer');
  assert.match(bar, /\{\.\.\.\(\{ inert: hidden \? '' : undefined \} as Record<string, unknown>\)\}/, 'not reachable while hidden');
  assert.equal((bar.match(/return slot\(/g) ?? []).length, 4, 'all four pill states ease');
  const css = read('src/renderer/src/design/global.css');
  // Going away: the fade first on the compositor, then the gap closes once
  // the column has slid in (owner, 2026-11-05: still abrupt going away, and
  // slower). Measured in Electron: fade 0 to about 300 ms, width 122 px to 0
  // from 260 to 700 ms; coming back, width over 440 ms, fade 160 to 520 ms.
  assert.match(css, /\.cth-pill-slot\[data-hidden\] \{ grid-template-columns: 0fr; margin-inline-start: -8px;\s*transition-duration: 440ms; transition-delay: 260ms; \}/);
  assert.match(css, /\.cth-pill-face \{ will-change: opacity, transform;/);
  assert.match(css, /\.cth-pill-slot\[data-hidden\] \.cth-pill-face \{ opacity: 0; transform: translateX\(14px\) scale\(\.94\);\s*transition-duration: 340ms; transition-delay: 0ms; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ \.cth-pill-slot, \.cth-pill-face \{ transition: none; \} \}/);
  assert.match(read('src/renderer/src/shell/rightColumn.ts'), /afterLeave\(\(\) => requestAnimationFrame\(\(\) => document\.getElementById\(NEEDS_YOU_PILL_ID\)\?\.focus\(\)\)\);/);
});

test('the board catches the paper plane while the pill is hidden', () => {
  // Value: protects=E3 (an arriving ask still shows its landing); fails_when=the board stops listening for the ping; why_new=owner 2026-11-05; seam=source pin
  const board = read('src/renderer/src/shell/NeedsYouBoard.tsx');
  assert.match(board, /window\.addEventListener\('cth:needs-you-ping', on\);/);
  assert.match(board, /<span key=\{bump\} className=\{bump \? 'cth-needs-bump' : undefined\}/);
});
