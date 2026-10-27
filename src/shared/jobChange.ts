/**
 * A team member's job as the owner changes it (docs/designs/work-style-change-request.md):
 * the owner says what should change, a rewrite returns the new job, and
 * Apply saves it with what Undo and a pack update need. Pure: Edit agent, the
 * hire wizard and the pack update card share it, and tests load it directly.
 *
 *   goal         the instructions the agent reads
 *   goalPlain    the plain words the owner reads, with the fingerprint of the
 *                instructions they describe: another writer that changes the
 *                instructions (a pack update, a first task fallback) leaves
 *                them stale, and Edit agent writes them again once (eng D5, OV3)
 *   description  the role line Michael routes by, "Title: what X handles"
 *   jobPrevious  the job before the last change: one level of Undo, text only (OV4)
 *   jobChanges   the change requests applied, oldest first, reapplied on a
 *                pack's new default (eng D7)
 *   handoffs     the work this member sends on to a teammate, as the owner
 *                explained it ("Not for technical questions; that goes to
 *                Nick." in the role line). Kept apart from hire bindings,
 *                which read the same, so only the owner's own splits show on
 *                the teammate's side (overlap split plan, S3).
 */
import { splitAgentRole } from './agentRole';
import { appendOnce, bindingLines, splitBindings } from './hireTemplates';

export interface PlainWords {
  text: string;
  /** jobFingerprint of the instructions these words describe. */
  of: string;
}

export interface JobChangeEntry {
  text: string;
  /** ISO time it was applied. */
  at: string;
}

/** Work a member sends on to a teammate, by the teammate's id: the name is
 *  read when shown, so a rename changes nothing here. */
export interface Handoff {
  toId: string;
  /** "technical questions": one line, no full stop. */
  scope: string;
  /** ISO time the owner's change wrote it. */
  at: string;
}

export interface JobVersion {
  goal?: string;
  goalPlain?: PlainWords;
  description: string;
  /** The change list as it was, so Undo after a pack update keeps the owner's. */
  jobChanges?: JobChangeEntry[];
  /** The handoffs as they were, for Undo. */
  handoffs?: Handoff[];
}

export interface JobFields {
  goal?: string;
  goalPlain?: PlainWords;
  description: string;
  jobPrevious?: JobVersion;
  jobChanges?: JobChangeEntry[];
  handoffs?: Handoff[];
}

/** What a rewrite returned, as Apply saves it. */
export interface RevisedJob {
  instructions: string;
  plain: string;
  /** The new "What X handles", or null when the duties didn't change. Any
   *  handoff lines are already in it (main writes them, so the overlap check
   *  sees them before Apply). */
  handles: string | null;
  /** Handoffs this change adds and takes back. */
  handoffs?: Array<{ toId: string; scope: string }>;
  drops?: Array<{ toId: string; scope: string }>;
}

/** The list kept per member: enough for every change an owner makes, short
 *  enough to send in one rewrite. */
export const JOB_CHANGES_MAX = 20;

/** FNV-1a over the text, as 8 hex digits: says "these are the same words",
 *  nothing more. */
export function jobFingerprint(text: string | undefined): string {
  let h = 0x811c9dc5;
  const s = (text ?? '').trim();
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** The saved plain words when they still describe these instructions. */
export function plainFor(job: { goalPlain?: PlainWords }, instructions: string): string | null {
  const p = job.goalPlain;
  return p?.text?.trim() && p.of === jobFingerprint(instructions) ? p.text : null;
}

const sameHandoff = (a: { toId: string; scope: string }, b: { toId: string; scope: string }): boolean =>
  a.toId === b.toId && a.scope.trim().toLowerCase() === b.scope.trim().toLowerCase();

/** The role line sentence a handoff writes: the hire binding form Michael
 *  already routes by. */
export function handoffLine(scope: string, toName: string): string {
  return bindingLines(scope, toName).others;
}

/** At most this many characters in a handoff's scope. */
export const HANDOFF_SCOPE_MAX = 120;

/**
 * A scope as the model wrote it, made safe for a role line: one line, no full
 * stop at the end, no dashes, and none of the words that would make it read as
 * another binding ("Only", "Not for", "that goes to"). Empty when nothing
 * usable is left.
 */
export function cleanHandoffScope(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/\s+/g, ' ').trim()
    .replace(/\s+[-\u2012-\u2015\u2212]+\s+/g, ', ')
    .replace(/[\u2012-\u2015\u2212]/g, ' ')
    .replace(/^(?:not for|only)\s+/i, '')
    .replace(/[.;:,\s]+$/, '')
    .trim();
  // BINDING_LINE_RE reads "Only " and "Not for " as the start of a line.
  if (/\b(?:not for|that goes to)\b/i.test(s) || /\bOnly /.test(s) || s.includes(';')) return '';
  if (s.length > HANDOFF_SCOPE_MAX) s = s.slice(0, HANDOFF_SCOPE_MAX).replace(/\s+\S*$/, '').trim();
  return s;
}

/**
 * A member's handoffs that are live now: the teammate is on the team and the
 * line is in the member's role line. Leaving takes the line out and coming
 * back puts it in (releaseBindings, restoredRoles), so the role line, which
 * is what Michael routes by, says whether a handoff holds (eng D3).
 */
export function liveHandoffs<T extends { id: string; name: string }>(
  member: { description?: string; handoffs?: Handoff[] },
  team: T[]
): Array<Handoff & { to: T; line: string }> {
  const out: Array<Handoff & { to: T; line: string }> = [];
  for (const h of member.handoffs ?? []) {
    const to = team.find((a) => a.id === h.toId);
    if (!to) continue;
    const line = handoffLine(h.scope, to.name);
    if ((member.description ?? '').includes(line)) out.push({ ...h, to, line });
  }
  return out;
}

/** Who sends work to `toId`, live, for the read-only line on their side:
 *  one entry per sender with their scopes in the order written. */
export function handoffsTo<T extends { id: string; name: string; description?: string; handoffs?: Handoff[] }>(
  toId: string,
  team: T[]
): Array<{ from: T; scopes: string[] }> {
  const out: Array<{ from: T; scopes: string[] }> = [];
  for (const from of team) {
    if (from.id === toId) continue;
    const scopes = liveHandoffs(from, team).filter((h) => h.toId === toId).map((h) => h.scope);
    if (scopes.length) out.push({ from, scopes });
  }
  return out;
}

/** The teammates a change adds to the overlap: named after it, not before.
 *  Teamwork the job already had is never charged to the owner's edit
 *  (owner's Kelly change, 2026-10-24). */
export function addedOverlaps(after: string[], before: string[]): string[] {
  const was = new Set(before.map((n) => n.trim().toLowerCase()));
  return after.filter((n) => !was.has(n.trim().toLowerCase()));
}

/** The handoffs left when a teammate is deleted for good: the ones to them
 *  go (spec review 2). Undefined when none are left. */
export function handoffsWithout(list: Handoff[] | undefined, toId: string): Handoff[] | undefined {
  const next = (list ?? []).filter((h) => h.toId !== toId);
  return next.length ? next : undefined;
}

/** The list after a change: drops first, then adds, one entry per teammate
 *  and scope; a re-added scope takes the new time. */
export function nextHandoffs(
  list: Handoff[] | undefined,
  change: { handoffs?: Array<{ toId: string; scope: string }>; drops?: Array<{ toId: string; scope: string }> },
  now: string
): Handoff[] | undefined {
  const adds = change.handoffs ?? [];
  const drops = change.drops ?? [];
  if (!adds.length && !drops.length) return list;
  let next = (list ?? []).filter((h) => !drops.some((d) => sameHandoff(h, d)));
  for (const a of adds) {
    next = next.filter((h) => !sameHandoff(h, a));
    next.push({ toId: a.toId, scope: a.scope, at: now });
  }
  return next.length ? next : undefined;
}

/** The job a rewrite started from, to tell at Apply whether it moved meanwhile (A3). */
export function jobBase(job: { goal?: string; description?: string }): string {
  return `${jobFingerprint(job.goal)}:${jobFingerprint(job.description)}`;
}

/** `before`'s role line with `now`'s binding lines in place of its own.
 *  A job saved before routing lines existed has none to go back to. */
function withBindingsOf(before: string, now: string): string {
  if (typeof before !== 'string') return before;
  const was = splitAgentRole(before);
  const lines = splitBindings(splitAgentRole(now).roleDescription).lines;
  const handles = lines.reduce((h, l) => appendOnce(h, l), splitBindings(was.roleDescription).text);
  return withHandles(was.role, handles);
}

/** "Title: handles" with a new handles part; the title is the owner's typed field (OV2). */
export function withHandles(title: string, handles: string): string {
  const t = title.trim().replace(/:+$/, '').trim();
  const h = handles.trim();
  return t && h ? `${t}: ${h}` : t || h;
}

/**
 * The fields Apply writes: the new job, the one before it for Undo, and the
 * change appended to the list (none for a pack default, which is no change of
 * the owner's). `title` is the role title the line keeps.
 */
export function applyJob(
  job: JobFields,
  revised: RevisedJob,
  opts: { title: string; change?: string; now: string }
): Pick<JobFields, 'goal' | 'goalPlain' | 'description' | 'jobPrevious' | 'jobChanges' | 'handoffs'> {
  const instructions = revised.instructions.trim();
  const description = revised.handles ? withHandles(opts.title, revised.handles) : job.description;
  const change = opts.change?.trim();
  return {
    goal: instructions,
    goalPlain: { text: revised.plain.trim(), of: jobFingerprint(instructions) },
    description,
    jobPrevious: { goal: job.goal, goalPlain: job.goalPlain, description: job.description, jobChanges: job.jobChanges, ...(job.handoffs ? { handoffs: job.handoffs } : {}) },
    jobChanges: change ? [...(job.jobChanges ?? []), { text: change, at: opts.now }].slice(-JOB_CHANGES_MAX) : job.jobChanges,
    // Only members who hand work on carry the list.
    ...(job.handoffs || revised.handoffs?.length || revised.drops?.length ? { handoffs: nextHandoffs(job.handoffs, revised, opts.now) } : {})
  };
}

/** Undo: the job and the change list as they were before the last change;
 *  null when there is nothing to go back to. The routing line keeps today's
 *  binding lines ("Not for refunds; that goes to Dwight."): a hire, a release
 *  or a rename since the change set them, and Michael routes by them (ship
 *  review, 2026-10-23). The owner's own handoffs go back too: a line the
 *  change added (and that was not there before it) comes out, and a line it
 *  took back returns, only while that teammate is on the team, as a released
 *  binding stays released (eng SC2). `nameOf` gives a teammate's name now, or
 *  undefined when they are not on the team. */
export function undoJob(
  job: JobFields,
  nameOf: (id: string) => string | undefined = () => undefined
): Pick<JobFields, 'goal' | 'goalPlain' | 'description' | 'jobPrevious' | 'jobChanges' | 'handoffs'> | null {
  const prev = job.jobPrevious;
  if (!prev) return null;
  let description = withBindingsOf(prev.description, job.description);
  const before = prev.handoffs ?? [];
  const now = job.handoffs ?? [];
  if (typeof description === 'string') {
    const split = splitAgentRole(description);
    let handles = split.roleDescription;
    for (const h of now.filter((n) => !before.some((b) => sameHandoff(b, n)))) {
      const name = nameOf(h.toId);
      if (!name) continue;
      const line = handoffLine(h.scope, name);
      if (prev.description?.includes(line)) continue;
      handles = handles.replace(line, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    for (const h of before.filter((b) => !now.some((n) => sameHandoff(b, n)))) {
      const name = nameOf(h.toId);
      if (name) handles = appendOnce(handles, handoffLine(h.scope, name));
    }
    description = withHandles(split.role, handles);
  }
  return {
    goal: prev.goal,
    goalPlain: prev.goalPlain,
    description,
    jobPrevious: undefined,
    jobChanges: prev.jobChanges,
    ...(prev.handoffs || job.handoffs ? { handoffs: prev.handoffs } : {})
  };
}

/** A place tracked numbers can live (design D5): the member's own folder (no
 *  `tool`), or a connector. `off` is switched off in Settings > Connections:
 *  listed, greyed, not pickable. `noAccess` is on there but not given to the
 *  member: pickable, and the preview says so (eng re-run D1). */
export interface HomeChoice { label: string; tool?: string; off?: boolean; noAccess?: boolean }

/** Tools shown before "Show all" (design D5). */
export const HOME_TOOLS_SHOWN = 4;

/** The tracking question's rows in order: the member's folder, the tools on
 *  in Settings A to Z, then the switched off ones; the first four tools only
 *  until Show all, and no fold under five (design D5). */
export function homeRows(choices: HomeChoice[], all: boolean): Array<{ choice: HomeChoice; toolsStart?: boolean }> & { hidden: number; tools: number } {
  const folder = choices.filter((c) => !c.tool);
  const byName = (a: HomeChoice, b: HomeChoice): number => a.label.localeCompare(b.label);
  const tools = [...choices.filter((c) => c.tool && !c.off).sort(byName), ...choices.filter((c) => c.tool && c.off).sort(byName)];
  const shown = all || tools.length <= HOME_TOOLS_SHOWN ? tools : tools.slice(0, HOME_TOOLS_SHOWN);
  const rows = [...folder.map((choice) => ({ choice })), ...shown.map((choice, i) => ({ choice, ...(i === 0 ? { toolsStart: true } : {}) }))];
  return Object.assign(rows, { hidden: tools.length - shown.length, tools: tools.length });
}
