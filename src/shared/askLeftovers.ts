/**
 * Nothing left unresolved on Ask me (docs/designs/ask-me-leftovers.md, owner
 * 2026-11-05). A question the owner did not settle, left unanswered or
 * answered "Not yet", is a leftover. Each gets a recorded decision on the
 * answered question: dropped, settled, ask now, or ask later at a time the
 * office chooses, three months out included. The app never sets a time to
 * act; it lists every leftover with no decision to Michael until it has one,
 * and tells him when a later one comes due.
 */

import { cardText, readAskShape, type AskOption } from './askMeRouting';
import { isNextAt } from './cardGuards';
import type { StuckCard } from './ownerRequests';

export const LEFTOVER_DECISIONS = ['dropped', 'settled', 'now', 'later'] as const;
export type LeftoverDecision = (typeof LEFTOVER_DECISIONS)[number];

/** One decision, as Michael records it on the answered question. `question`
 *  is the question's number on the card as the owner sees it: 1 for a single
 *  question, else its place among several. */
export interface LeftoverRecord { question: number; decision: LeftoverDecision; why: string; at?: string }

/** A "Not yet" option: marked `later`, or labelled so, for asks already on the board. */
export function isLaterOption(o: Pick<AskOption, 'label' | 'later'> | undefined): boolean {
  return !!o && (o.later === true || /^not yet\b/i.test(o.label.trim()));
}

type Entry = {
  q?: unknown; a?: unknown; options?: unknown; parts?: unknown; picked?: unknown; partAnswers?: unknown;
  answeredAt?: unknown; kind?: unknown; leftovers?: unknown;
};

/**
 * The questions of an answered ask the owner did not settle, by their number
 * on the card. A single question is a leftover only when its pick was a Not
 * yet; one of several also when it was left unanswered.
 */
export function leftoversOf(e: Entry | null | undefined): number[] {
  if (!e || typeof e.a !== 'string' || !e.a.trim() || typeof e.answeredAt !== 'string') return [];
  if (e.kind === 'report' || e.kind === 'foundation') return [];
  const shape = readAskShape(e);
  if (shape.kind === 'choice') {
    const picked = typeof e.picked === 'number' && Number.isInteger(e.picked) ? shape.options[e.picked] : undefined;
    return isLaterOption(picked) ? [1] : [];
  }
  // An answer to several questions records each one; without that record
  // (an answer from before it was kept) nothing can be told apart.
  if (shape.kind !== 'parts' || !Array.isArray(e.partAnswers)) return [];
  const answers = e.partAnswers as unknown[];
  const out: number[] = [];
  shape.parts.forEach((p, i) => {
    const a = answers[i];
    if (typeof a !== 'string' || !a.trim()) { out.push(i + 1); return; }
    if (p.options?.some((o) => isLaterOption(o) && (a === o.label || a.startsWith(`${o.label} (`)))) out.push(i + 1);
  });
  return out;
}

/** The decisions recorded on an answered question that the app can act on:
 *  a known decision, a reason, and for "later" a time it can read. */
export function decisionsOf(e: Entry | null | undefined): Map<number, LeftoverRecord> {
  const out = new Map<number, LeftoverRecord>();
  if (!e || !Array.isArray(e.leftovers)) return out;
  for (const raw of e.leftovers as unknown[]) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as { question?: unknown; decision?: unknown; why?: unknown; at?: unknown };
    if (typeof r.question !== 'number' || !Number.isInteger(r.question) || r.question < 1) continue;
    if (!LEFTOVER_DECISIONS.includes(r.decision as LeftoverDecision)) continue;
    if (typeof r.why !== 'string' || !r.why.trim()) continue;
    if (r.decision === 'later' && !isNextAt(r.at)) continue;
    // The last record for a question wins: a later decision can be revised.
    out.set(r.question, { question: r.question, decision: r.decision as LeftoverDecision, why: r.why.trim(), ...(r.decision === 'later' ? { at: r.at as string } : {}) });
  }
  return out;
}

/** The leftovers of an answered question that have no decision yet. */
export function undecidedLeftovers(e: Entry | null | undefined): number[] {
  const decided = decisionsOf(e);
  return leftoversOf(e).filter((n) => !decided.has(n));
}

type Card = { id?: unknown; title?: unknown; assignee?: unknown; humanQA?: unknown };

/**
 * Cards whose answered questions hold leftovers with no decision, for
 * Michael's tidy list each turn. Only answers since `sinceMs` count, so the
 * answers given before this existed are not brought back.
 */
export function leftoversToDecide(cards: readonly Card[], sinceMs: number): StuckCard[] {
  const out: StuckCard[] = [];
  for (const c of cards) {
    if (!c || typeof c.id !== 'string' || !Array.isArray(c.humanQA)) continue;
    const open: string[] = [];
    for (const e of c.humanQA as Entry[]) {
      if (!e || typeof e.answeredAt !== 'string' || !(Date.parse(e.answeredAt) >= sinceMs)) continue;
      const left = undecidedLeftovers(e);
      if (left.length) open.push(`question${left.length === 1 ? '' : 's'} ${left.join(', ')} of the answer at ${e.answeredAt}`);
    }
    if (!open.length) continue;
    out.push({
      id: c.id,
      title: (typeof c.title === 'string' && c.title.trim()) || c.id,
      ...(typeof c.assignee === 'string' && c.assignee ? { assignee: c.assignee } : {}),
      issue: 'leftovers',
      leftovers: open.join('; ')
    });
  }
  return out;
}

/** A "later" leftover whose time has come. */
export interface DueLeftover { key: string; taskId: string; title: string; question: number; q: string; why: string; at: string }

/** The question's own words: the part's for one of several, else the ask's. */
function questionText(e: Entry, n: number): string {
  const shape = readAskShape(e);
  if (shape.kind === 'parts') return shape.parts[n - 1]?.q ?? '';
  return typeof e.q === 'string' ? e.q : '';
}

/**
 * Every "later" leftover whose time has come, on any card, a Done card
 * included, that Michael was not told about yet. The key holds the time, so a
 * revised time is a new reminder.
 */
export function dueLeftovers(cards: readonly Card[], now: number, told: ReadonlySet<string>): DueLeftover[] {
  const out: DueLeftover[] = [];
  for (const c of cards) {
    if (!c || typeof c.id !== 'string' || !Array.isArray(c.humanQA)) continue;
    (c.humanQA as Entry[]).forEach((e, index) => {
      for (const r of decisionsOf(e).values()) {
        if (r.decision !== 'later' || !r.at || Date.parse(r.at) > now) continue;
        const key = `${c.id}|${index}|${r.question}|${r.at}`;
        if (told.has(key)) continue;
        out.push({ key, taskId: c.id as string, title: (typeof c.title === 'string' && c.title.trim()) || (c.id as string), question: r.question, q: questionText(e, r.question), why: r.why, at: r.at });
      }
    });
  }
  return out;
}

/** The note Michael gets when a later leftover comes due. */
export function leftoverDueNote(d: DueLeftover): { subject: string; body: string } {
  return {
    subject: `Leftover question due: card ${cardText(d.taskId, 60)}`,
    body: `A question the owner did not settle on card ${cardText(d.taskId, 60)} ("${cardText(d.title)}") was kept for ${d.at}, and that time has come. The question: "${cardText(d.q, 400)}". Why it was kept for later: ${cardText(d.why, 300)}. Have the team member who asked check it against what the office knows now, then ask it again on the same card (move the card to "blocked" with the ask), or record a new decision for it on that answered question, such as "later" with a new time or "dropped" with why.`
  };
}
