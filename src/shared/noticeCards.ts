/**
 * Notice cards (docs/designs/owner-items-reach-ask-me.md, owner 2026-11-05):
 * a report card a team member's "notice" filing became, named by the kind of
 * notice it is. The owner clears one with Got it, or with "Don't show me
 * these", which teaches the member who raised it to stop filing that kind.
 * After three Got its in a row for one kind, Michael asks whether to keep
 * showing them (D2): nothing is ever skipped without the owner's say.
 */

import { raiserOf } from './askMeRouting';

/** Got its in a row, for one kind from one member, before Michael asks. */
export const GOT_IT_STREAK = 3;

/** What `dismissedReason` records for each way the owner clears a notice. */
export const GOT_IT = 'Got it';
export const NOT_NEEDED = 'Not needed';

/** A notice's kind, the way the member named it, as one short line. */
export function noticeKindOf(e: { noticeKind?: unknown } | null | undefined): string {
  const k = typeof e?.noticeKind === 'string' ? e.noticeKind.replace(/\s+/g, ' ').trim() : '';
  return k.slice(0, 80);
}

/** One key per member and kind, so "App Store review result" and "app store
 *  review result" count together. */
export function noticeKey(raiser: string, kind: string): string {
  return `${raiser}\u0000${kind.toLowerCase()}`;
}

type Entry = { kind?: unknown; noticeKind?: unknown; raisedBy?: unknown; dismissedAt?: unknown; dismissedReason?: unknown; dismissedBy?: unknown };
type Card = { assignee?: unknown; humanQA?: unknown };

/**
 * How many notices of this kind from this member the owner cleared with Got
 * it in a row, counting back from the latest. A "Don't show me these" ends
 * the run, and so does any other way a notice was cleared.
 */
export function gotItStreak(cards: readonly Card[], raiser: string, kind: string, known?: ReadonlySet<string>): number {
  const key = noticeKey(raiser, kind);
  const cleared: { at: string; reason: string }[] = [];
  for (const c of cards) {
    if (!c || !Array.isArray(c.humanQA)) continue;
    for (const e of c.humanQA as Entry[]) {
      if (!e || e.kind !== 'report' || e.dismissedBy !== 'owner' || typeof e.dismissedAt !== 'string') continue;
      // The raiser the card's clear names (askMeRouting raiserOf): a stale or
      // mistyped raisedBy falls back to the assignee, and an assignee who left
      // the team to Michael, so a notice counts under the id the clear used.
      // With no team given, every id counts as known.
      const raisedBy = typeof e.raisedBy === 'string' ? e.raisedBy : undefined;
      const assignee = typeof c.assignee === 'string' ? c.assignee : undefined;
      const by = known
        ? raiserOf({ raisedBy }, { assignee }, known)
        : raisedBy || assignee || '';
      const k = noticeKindOf(e);
      if (!k || noticeKey(by, k) !== key) continue;
      cleared.push({ at: e.dismissedAt, reason: typeof e.dismissedReason === 'string' ? e.dismissedReason : '' });
    }
  }
  cleared.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  let n = 0;
  for (let i = cleared.length - 1; i >= 0 && cleared[i].reason === GOT_IT; i--) n++;
  return n;
}

/** The note Michael gets when the owner has cleared GOT_IT_STREAK notices of
 *  one kind in a row (B5). Sent once per member and kind. */
export function keepShowingNote(kind: string, raiser: string, raiserName: string): { subject: string; body: string } {
  return {
    subject: `Notices cleared: ${kind}`,
    body: `The owner has cleared the last ${GOT_IT_STREAK} "${kind}" notices from ${raiserName} with Got it. Ask on Ask me whether to keep showing them: a card assigned to ${raiserName} with "raisedBy": "${raiser}" and the options "Keep showing them" and "Stop showing them". The owner's answer reaches ${raiserName}'s memory with the card.`
  };
}

/** The line kept in the raiser's memory when the owner presses "Don't show me these" (B2). */
export function skipNoticeLine(kind: string, day: string): string {
  return `From the owner (${day}): don't show me notices of this kind: "${kind}". Stop filing them; keep them in your records and your report to Michael.`;
}
