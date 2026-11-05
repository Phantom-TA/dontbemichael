'use strict';

/**
 * The Needs you column minimizes to a slim strip with the count
 * (docs/designs/needs-you-minimize.md, owner 2026-11-05), so a tab reads at
 * nearly the full width while every waiting ask stays in sight (D12 of
 * needs-you-empty-state.md holds: the column is never hidden while asks wait).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function freshRun(body) {
  const script = `
    const mem = {};
    const storage = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    globalThis.window = { localStorage: storage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
    globalThis.localStorage = storage;
    const store = require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/renderer/src/store/store.ts').useStore;
    const out = (() => { ${body} })();
    process.stdout.write(JSON.stringify(out));`;
  return JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: root, encoding: 'utf8' }));
}

test('minimized holds while an ask arrives, and every owner open brings the column back full size', () => {
  // Value: protects=D3 (a new ask keeps it minimized) and E3 (the pill, a person or a chip opens it full); fails_when=the app's own opening clears it, an owner open leaves it minimized, or a closed column reopens minimized; why_new=owner 2026-11-05; seam=the real store in its own process
  const r = freshRun(`
    const s = () => store.getState();
    s().setRightColumn('board');
    s().setColumnMinimized(true);
    const set = s().columnMinimized;
    s().setRightColumn('board', { claim: false });
    const arrival = s().columnMinimized;
    s().openNeedsYou();
    const pill = s().columnMinimized;
    s().setColumnMinimized(true);
    s().setRightColumn('person');
    const person = s().columnMinimized;
    s().setColumnMinimized(true);
    s().setRightColumn('closed');
    const closed = [s().rightColumn, s().columnMinimized];
    return { set, arrival, pill, person, closed, saved: Object.keys(mem).some((k) => /minim/i.test(k)) };`);
  assert.equal(r.set, true);
  assert.equal(r.arrival, true, 'an ask arriving (the app opening the board) keeps it minimized (D3)');
  assert.equal(r.pill, false, 'the pill opens it full size');
  assert.equal(r.person, false, 'opening a person opens it full size');
  assert.deepEqual(r.closed, ['closed', false], 'a closed column opens full size next time');
  assert.equal(r.saved, false, 'minimized is for this session only (E2)');
});

test('the strip pulses only when the count rises', () => {
  // Value: protects=a new ask is noticed, an answer is not mistaken for one; fails_when=the strip pulses on a fall or on the first read; why_new=owner 2026-11-05 (D3); seam=none
  const { railPulses } = loadTs('src/renderer/src/shell/rightColumn.ts');
  assert.equal(railPulses(null, 6), false, 'the first read');
  assert.equal(railPulses(6, 7), true, 'a new ask');
  assert.equal(railPulses(7, 6), false, 'an answer');
  assert.equal(railPulses(6, 6), false);
});

test('the column stays mounted and hidden while minimized, and the strip takes its place', () => {
  // Value: protects=E1 (a terminal or a half written reply survives) and D1 (the count stays in sight); fails_when=minimizing unmounts the column, the strip is missing, the splitter or office keeps the full width, or a click on the strip at zero closes the column; why_new=owner 2026-11-05; seam=source pins
  const app = read('src/renderer/src/App.tsx');
  assert.match(app, /const minimized = columnMinimized && !wide;/, 'never while a panel is wide (E4)');
  assert.match(app, /display: columnView && !minimized \? 'flex' : 'none'/, 'hidden, not unmounted');
  assert.match(app, /\{columnShown && minimized && <NeedsYouRail \/>\}/);
  assert.match(app, /\{columnFull && \(\s*<SidebarSplitter/);
  assert.match(app, /bleed=\{columnShown \? columnW \+ 10 : 0\}/);
  assert.match(app, /target\.closest\(`#\$\{NEEDS_YOU_PILL_ID\}, \.cth-splitter, \[data-needs-you-rail\]`\)/);
  // D12 itself is unchanged: the column is still locked open while asks wait.
  assert.match(read('src/renderer/src/shell/rightColumn.ts'), /return status === 'ready' && count > 0;/);
});

test('the minimize button sits on the board and a person\'s panel, never on a wide panel', () => {
  // Value: protects=D2 (one button wherever the column shows) and E4; fails_when=a header loses it or a wide panel shows it; why_new=owner 2026-11-05; seam=source pins
  assert.match(read('src/renderer/src/shell/NeedsYouBoard.tsx'), /<MinimizeColumnButton size=\{26\} \/>/);
  assert.match(read('src/renderer/src/shell/PanelChrome.tsx'), /<MinimizeColumnButton \/>\s*<WideButton \/>/);
  const rail = read('src/renderer/src/shell/NeedsYouRail.tsx');
  assert.match(rail, /if \(panelWide\) return null;/);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const shell = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).shell;
    for (const k of ['minimizeColumn', 'railOpen', 'railOpenCount']) {
      assert.ok(shell[k], `${loc} shell.${k}`);
      assert.doesNotMatch(shell[k], /[–—]/, `${loc} shell.${k} has no dash`);
    }
    assert.match(shell.railOpenCount, /\{\{count\}\}/, loc);
  }
});
