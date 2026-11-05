'use strict';

// Lane layout for the commit history rail. Untested while it sat unused; now it
// is what the graph actually renders from, so the shapes it has to get right are
// pinned here.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { layoutGraph, LANE_COLORS, runLane } = loadTs('src/renderer/src/components/git/graph.ts');

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

/** Each link as CommitGraph.tsx draws it: its straight run in runLane (the
 *  child's lane, or for a merge's other parent the lane kept for it), then into
 *  the parent's own lane at its row. Lists any link whose straight run passes
 *  another commit's dot in that lane. */
function crossings(out) {
  const at = new Map(out.rows.map((r, i) => [r.sha, i]));
  const hits = [];
  out.rows.forEach((r, i) => {
    r.parents.forEach((p, n) => {
      const j = at.get(p.sha);
      const lane = runLane(r, n);
      for (let k = i + 1; j !== undefined && k < j; k++) if (out.rows[k].lane === lane) hits.push(`${r.sha} -> ${p.sha} crosses ${out.rows[k].sha}`);
    });
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

test('a merge\'s other parent is drawn in the lane kept for it, so it never runs through the first parent\'s dots', () => {
  // Value: protects=a merge's side branch reads as its own line; fails_when=the second parent's line runs down the merge's own lane, over the first parent's line and through its dots; why_new=review on #544 (the second parent's line, drawn down the merge's lane, crossed dots in most histories with a merge); seam=runLane is what CommitGraph.tsx draws with, pinned below
  const out = layoutGraph([c('m', 'p1', 'p2'), c('p1', 'base'), c('p2', 'base'), c('base')]);
  const m = out.rows[0];
  assert.equal(runLane(m, 0), m.lane, 'the first parent goes on down the merge\'s lane');
  assert.equal(runLane(m, 1), m.parents[1].lane, 'the other one turns into its own');
  assert.notEqual(runLane(m, 1), m.lane);
  assert.deepEqual(crossings(out), []);
  const graph = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/renderer/src/components/git/CommitGraph.tsx'), 'utf8');
  assert.match(graph, /const xr = laneX\(runLane\(r, k\)\);/);
  assert.match(graph, /key=\{`\$\{r\.sha\}-\$\{k\}-\$\{p\.sha\}`\}/, 'a parent named twice still gets its own key');
});

test('no line runs through a dot in thousands of random merge histories', () => {
  // Value: protects=the rail never draws a line through an unrelated commit; fails_when=any first or other parent's straight run passes a dot in its lane; why_new=review on #544 ran 3,000 random histories; seam=a seeded generator, so a failure repeats
  let seed = 544;
  const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let h = 0; h < 2000; h++) {
    // Oldest first: each commit has one earlier parent, or two for a merge.
    const made = [];
    const size = 2 + Math.floor(rand() * 40);
    for (let i = 0; i < size; i++) {
      if (i === 0) { made.push(c('c0')); continue; }
      const a = Math.floor(rand() * i);
      const b = Math.floor(rand() * i);
      made.push(rand() < 0.3 && a !== b ? c(`c${i}`, `c${a}`, `c${b}`) : c(`c${i}`, `c${a}`));
    }
    const out = layoutGraph(made.reverse());
    assert.deepEqual(crossings(out), [], `history ${h}`);
  }
});

test('the Git tab reads its log in topological order, as the layout assumes', () => {
  // Value: protects=a link always points at a row below it; fails_when=getLog drops --topo-order, so a parent can come before its child and its link points at an empty lane; why_new=review on #544; seam=source pin, git.ts runs git
  const git = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src/main/git.ts'), 'utf8');
  const getLog = git.slice(git.indexOf('export async function getLog('), git.indexOf('export async function getBranches('));
  assert.match(getLog, /'log', '--all', '--topo-order'/);
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
