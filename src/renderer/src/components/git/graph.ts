// Lay out a list of commits into swim lanes for a left-side graph rail.
// We don't try to match `git log --graph` exactly — instead we walk the
// commits top-to-bottom, assigning each one to the leftmost free lane and
// drawing connections to its parents in the lanes they occupy.

export interface CommitInput {
  sha: string;
  parents: string[];
}

export interface CommitLayout {
  sha: string;
  /** lane this commit's dot sits in */
  lane: number;
  /** parents and the lane they live in (or -1 if not in window) */
  parents: Array<{ sha: string; lane: number }>;
}

export interface GraphLayout {
  rows: CommitLayout[];
  /** max lane index used */
  maxLane: number;
}

export function layoutGraph(commits: CommitInput[]): GraphLayout {
  // `lanes[i]` = sha that lane i is currently "expecting" as the next commit, or undefined
  const lanes: (string | undefined)[] = [];
  const rows: CommitLayout[] = [];
  let maxLane = 0;

  // Initially nothing is expected; lanes get populated as commits introduce parents.
  for (const c of commits) {
    // Pick the lane for this commit
    let lane = lanes.findIndex(s => s === c.sha);
    if (lane === -1) {
      // No descendant; allocate a fresh lane on the right of the busy area
      lane = lanes.findIndex(s => s === undefined);
      if (lane === -1) { lane = lanes.length; lanes.push(c.sha); }
      else lanes[lane] = c.sha;
    }
    // Every other lane waiting for this commit ends at its row. Two branches off
    // one commit each keep a lane down to it (so neither line crosses the other's
    // dots); left open, those lanes pushed the rail right with every merge.
    for (let k = lane + 1; k < lanes.length; k++) if (lanes[k] === c.sha) lanes[k] = undefined;
    // The commit occupies `lane`; its parents will continue in lanes.
    // The first parent stays in our lane; additional parents go to fresh lanes.
    const parents: CommitLayout['parents'] = [];
    if (c.parents.length === 0) {
      lanes[lane] = undefined;
    } else {
      for (let i = 0; i < c.parents.length; i++) {
        const p = c.parents[i];
        if (i === 0) {
          lanes[lane] = p;
          parents.push({ sha: p, lane });
        } else {
          // Place in new lane (leftmost free)
          let pl = lanes.findIndex(s => s === undefined);
          if (pl === -1) { pl = lanes.length; lanes.push(p); }
          else lanes[pl] = p;
          parents.push({ sha: p, lane: pl });
        }
      }
    }
    // Compact: trim trailing undefined lanes
    while (lanes.length > 0 && lanes[lanes.length - 1] === undefined) lanes.pop();

    rows.push({ sha: c.sha, lane, parents });
    if (lane > maxLane) maxLane = lane;
    for (const p of parents) if (p.lane > maxLane) maxLane = p.lane;
  }
  return { rows, maxLane };
}

/** The lane a link's long straight run is drawn in. A first parent's line goes
 *  on down the child's lane; a merge's other parent turns into the lane the
 *  layout kept for it just below the merge, so it never runs over the first
 *  parent's line or through a dot drawn in the merge's own lane. */
export function runLane(child: CommitLayout, parentIndex: number): number {
  return parentIndex === 0 ? child.lane : child.parents[parentIndex].lane;
}

// Color cycle per lane for the rail
export const LANE_COLORS = [
  'var(--cth-sky)',
  'var(--cth-lemon)',
  'var(--cth-mint)',
  'var(--cth-coral)',
  'var(--cth-lilac)',
  'var(--cth-peach)'
];
