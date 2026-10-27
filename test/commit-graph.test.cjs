'use strict';

// Lane layout for the commit history rail. Untested while it sat unused; now it
// is what the graph actually renders from, so the shapes it has to get right are
// pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { layoutGraph, LANE_COLORS } = loadTs('src/renderer/src/components/git/graph.ts');

/** `c('a', 'b')` = commit a whose parent is b. Newest first, as git log emits. */
const c = (sha, ...parents) => ({ sha, parents });
const laneOf = (out, sha) => out.rows.find((r) => r.sha === sha).lane;

test('linear history stays in a single lane', () => {
  const out = layoutGraph([c('a', 'b'), c('b', 'c'), c('c')]);
  assert.deepEqual(out.rows.map((r) => r.lane), [0, 0, 0]);
  assert.equal(out.maxLane, 0);
});

test('a merge sends the SECOND parent to a fresh lane', () => {
  // m has two parents; the first continues m's lane, the side branch forks.
  const out = layoutGraph([c('m', 'p1', 'p2'), c('p1', 'base'), c('p2', 'base'), c('base')]);
  assert.equal(laneOf(out, 'm'), 0);
  assert.equal(laneOf(out, 'p1'), 0, 'first parent keeps the lane');
  assert.notEqual(laneOf(out, 'p2'), 0, 'second parent forks');
  assert.ok(out.maxLane >= 1);
});

test('a lane is reused once its branch is exhausted', () => {
  // side ends at its root, so the lane it held is free for a later fork.
  const out = layoutGraph([
    c('m', 'p1', 'side'),
    c('side'),          // root — releases its lane
    c('p1', 'p2'),
    c('p2', 'x', 'y'),  // forks again; should reclaim the freed lane
    c('x'), c('y')
  ]);
  assert.ok(out.maxLane <= 1, `expected lanes to be reused, got maxLane ${out.maxLane}`);
});

test('a parent outside the window does not widen the graph', () => {
  // The newest commit's parent was not fetched — common with `git log -n`.
  const out = layoutGraph([c('a', 'missing')]);
  assert.equal(laneOf(out, 'a'), 0);
  assert.equal(out.maxLane, 0);
});

test('every row reports the lane each of its parents landed in', () => {
  const out = layoutGraph([c('m', 'p1', 'p2'), c('p1'), c('p2')]);
  const m = out.rows.find((r) => r.sha === 'm');
  assert.equal(m.parents.length, 2);
  assert.equal(m.parents[0].lane, laneOf(out, 'p1'));
  assert.equal(m.parents[1].lane, laneOf(out, 'p2'));
});

/** Each link as CommitGraph.tsx draws it: straight down the child's lane, then
 *  into the parent's own lane at its row. Lists any link whose straight run
 *  passes another commit's dot in that lane. */
function crossings(out) {
  const at = new Map(out.rows.map((r, i) => [r.sha, i]));
  const hits = [];
  out.rows.forEach((r, i) => {
    for (const p of r.parents) {
      const j = at.get(p.sha);
      for (let k = i + 1; j !== undefined && k < j; k++) if (out.rows[k].lane === r.lane) hits.push(`${r.sha} -> ${p.sha} crosses ${out.rows[k].sha}`);
    }
  });
  return hits;
}

test('merged PRs keep the graph narrow, and every line ends at its parent\'s dot', () => {
  // Value: protects=the rail stays a few lanes wide on an ordinary merge history and each line meets its parent; fails_when=a lane that waited for a shared parent stays open after its row, so every merged PR pushes the rail right, or a line ends in the lane kept for it beside the parent; why_new=review on #544; seam=the drawing's end point is a source pin, CommitGraph.tsx needs React
  // A "merge pull request" history: each feature branch forks from and merges
  // back into the main line, so its parent is already expected in lane 0.
  const out = layoutGraph([
    c('m2', 'm1', 'f2'), c('f2', 'm1'),
    c('m1', 'base', 'f1'), c('f1', 'base'),
    c('base', 'root'), c('root')
  ]);
  assert.deepEqual(out.rows.map((r) => r.lane), [0, 1, 0, 1, 0, 0]);
  assert.equal(out.maxLane, 1);
  assert.deepEqual(crossings(out), []);
  const two = layoutGraph([c('a', 'base'), c('b', 'base'), c('base', 'root'), c('root')]);
  assert.deepEqual(two.rows.map((r) => r.lane), [0, 1, 0, 0], 'two tips on one commit');
  const graph = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/renderer/src/components/git/CommitGraph.tsx'), 'utf8');
  assert.match(graph, /const x2 = laneX\(rows\[j\]\.lane\);/);
});

test('three branches off one commit keep a lane each, so no line runs through another branch\'s dot', () => {
  // Value: protects=several open branches off one base read as separate lines; fails_when=a tip's lane is freed before its parent's row, so the next tip takes it and the first line runs down through its dot; why_new=review on #544; seam=none
  const out = layoutGraph([c('a', 'd'), c('b', 'd'), c('c', 'd'), c('d', 'e'), c('x', 'e'), c('e')]);
  assert.deepEqual(out.rows.map((r) => r.lane), [0, 1, 2, 0, 1, 0], 'the lanes close at d, so x reuses one');
  assert.deepEqual(crossings(out), []);
  assert.equal(out.maxLane, 2);
});

test('an empty history is not a crash', () => {
  const out = layoutGraph([]);
  assert.deepEqual(out.rows, []);
  assert.equal(out.maxLane, 0);
});

test('lane colours are design tokens, so the rail follows the theme', () => {
  assert.ok(LANE_COLORS.length > 0);
  for (const col of LANE_COLORS) assert.match(col, /^var\(--cth-/);
});
