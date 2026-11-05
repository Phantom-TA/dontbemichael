/** A desk stays dark at most this long, so a quiet engine never leaves it off
 *  (DESIGN.md 8.12). */
export const CLOCK_IN_CAP_MS = 60_000;

/** Who is still clocking in at `now`: their action is the clocking in `marker`,
 *  first seen less than CLOCK_IN_CAP_MS ago. `since` remembers when each was
 *  first seen and forgets anyone who is in. */
export function clockingIn(agents: ReadonlyArray<{ id: string; action?: string }>, since: Map<string, number>, now: number, marker: string): Set<string> {
  const out = new Set<string>();
  for (const a of agents) {
    if (a.action !== marker) { since.delete(a.id); continue; }
    if (!since.has(a.id)) since.set(a.id, now);
    if (now - (since.get(a.id) ?? now) < CLOCK_IN_CAP_MS) out.add(a.id);
  }
  return out;
}

/** The office opening (DESIGN.md 7.24, design review 2026-10-18): from launch,
 *  or a Restore team, until the team is first all in or the cap passes. Then it
 *  is over for the session, so a mid-day hire clocks in on their desk only. */
export type OfficeOpening =
  | { kind: 'opening'; since: number }
  | { kind: 'done'; at: number; total: number }
  | { kind: 'short'; at: number; total: number; missing: string[] }
  | { kind: 'over' };

/** The opening never ends before the saved team has had its chance to come
 *  back: the automatic restore starts 2.5 s after launch (useRestoreTeam.ts). */
export const OPENING_SETTLE_MS = 4_000;
/** How long "Everyone's in" stays before it fades. */
export const DONE_SHOWN_MS = 2_000;
/** How long the cap's note ("Toby hasn't clocked in") stays before it fades. */
export const SHORT_SHOWN_MS = 4_000;

/** The floor and Ask me wait at launch at most this long, whatever the opening
 *  is waiting on: a lock must open by itself (owner, 2026-10-30). */
export const LOCK_LIMIT_MS = 70_000;
/** The time line waits this long, so it never reads "0 seconds" or names a
 *  slowest member among people who all started a moment ago. */
export const WAIT_SHOWN_FROM_MS = 5_000;
/** From here the card says the slowest member is taking longer than usual. */
export const SLOW_AFTER_MS = 30_000;
/** A member's terminal silent this long reads as gone quiet, once they are slow. */
export const QUIET_AFTER_MS = 15_000;

/** A member is in once their engine says it started (owner, 2026-10-30): a
 *  compact or clear is the same process carrying on. */
export function engineStarted(event: string, source: string | undefined): boolean {
  return event === 'SessionStart' && (source === 'startup' || source === 'resume');
}

/** When the opening's clock started. `since` is set when the app loads, which
 *  can be minutes old after first time setup, so the clock starts when the
 *  opening first shows. The automatic restore reopens the opening a moment into
 *  launch: that is the same wait, so the clock carries on while the lock is on. */
export function openingClock(prev: { since: number; at: number } | null, since: number, locked: boolean, now: number): { since: number; at: number } {
  if (!prev || (prev.since !== since && !locked)) return { since, at: now };
  return prev.since === since ? prev : { since, at: prev.at };
}

/** Why the launch lock ends now, or null while it holds. */
export type LockEnd = 'opened' | 'michael-stopped' | 'limit';
export function lockEnd(opening: OfficeOpening, michaelStopped: boolean, startedAt: number, now: number): LockEnd | null {
  if (opening.kind !== 'opening') return 'opened';
  if (michaelStopped) return 'michael-stopped';
  return now - startedAt >= LOCK_LIMIT_MS ? 'limit' : null;
}

/** Who has been coming longest: first seen earliest, roster order on a tie. */
export function slowestOut<T extends { id: string }>(coming: ReadonlyArray<T>, since: ReadonlyMap<string, number>): T | null {
  let best: T | null = null;
  for (const a of coming) if (!best || (since.get(a.id) ?? Infinity) < (since.get(best.id) ?? Infinity)) best = a;
  return best;
}

/** What the card's time line adds. `lastOutputAt` undefined means no reading,
 *  which never counts as quiet: a failed read must not raise a false alarm. */
export type WaitNote = 'time' | 'slowest' | 'longer' | 'quiet';
export function waitNote(hasSlowest: boolean, elapsedMs: number, lastOutputAt: number | undefined, now: number): WaitNote | null {
  if (elapsedMs < WAIT_SHOWN_FROM_MS) return null;
  if (!hasSlowest) return 'time';
  if (elapsedMs < SLOW_AFTER_MS) return 'slowest';
  return lastOutputAt !== undefined && now - lastOutputAt >= QUIET_AFTER_MS ? 'quiet' : 'longer';
}

export interface OpeningInput {
  /** Everyone on the floor, in roster order. */
  team: ReadonlyArray<{ id: string; name: string; action?: string; isGod?: boolean }>;
  /** How many are still clocking in under the cap (clockingIn()). */
  arriving: number;
  /** Michael is starting with no team on the floor yet. */
  michaelStarting: boolean;
  /** A Restore team run is still bringing people back. */
  restoring: boolean;
  /** The clocking in action marker. */
  marker: string;
}

/** The opening's next step at `now`. Returns `o` itself when nothing changes. */
export function nextOpening(o: OfficeOpening, input: OpeningInput, now: number): OfficeOpening {
  if (o.kind === 'over') return o;
  if (o.kind === 'done') return now - o.at >= DONE_SHOWN_MS ? { kind: 'over' } : o;
  if (o.kind === 'short') return now - o.at >= SHORT_SHOWN_MS ? { kind: 'over' } : o;
  if (now - o.since < OPENING_SETTLE_MS || input.restoring || input.arriving > 0) return o;
  // An office with no team ends quietly once Michael is in: the empty floor
  // has its own card, and there is nobody to have been waiting for. Michael
  // alone on the floor is still no team.
  if (input.team.every((a) => a.isGod)) return input.michaelStarting ? o : { kind: 'over' };
  const missing = stillOut(input.team, input.marker);
  const total = input.team.length;
  return missing.length ? { kind: 'short', at: now, total, missing } : { kind: 'done', at: now, total };
}

/** Who has not clocked in yet, by name, in roster order: everyone still
 *  carrying the marker, past the cap or not. */
export function stillOut(team: OpeningInput['team'], marker: string): string[] {
  return team.filter((a) => a.action === marker).map((a) => a.name);
}

/** The first `max` names and how many more ("Toby, Ryan, Oscar and 4 more"). */
export function namesShown(names: ReadonlyArray<string>, max = 3): { names: string[]; more: number } {
  return { names: names.slice(0, max), more: Math.max(0, names.length - max) };
}
