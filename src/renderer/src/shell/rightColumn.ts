/**
 * Small rules for the right column (docs/designs/needs-you-empty-state.md).
 * Plain TypeScript so the tests can run them.
 */
import { afterLeave } from '../store/leaveGuard';

/** The top bar pill's id, so closing the column can hand focus back (D10). */
export const NEEDS_YOU_PILL_ID = 'cth-needs-you-pill';

/** While anything waits on the owner the column stays open and cannot be
 *  closed; the office takes the window only when nothing at all waits (owner,
 *  2026-10-02, superseding D1, D6 and D7). */
export function columnLocked(status: 'unknown' | 'ready', count: number): boolean {
  return status === 'ready' && count > 0;
}

/** Where closing a person's or Michael's panel goes: back to the board while
 *  anything waits, otherwise the column closes. */
export function closeTarget(locked: boolean): 'board' | 'closed' {
  return locked ? 'board' : 'closed';
}

/** What Esc does to the column (eng R2): only with focus inside it, only when
 *  nothing else already took the key, never while asks wait, and a reply field
 *  holding text is left first, so a half written answer stays on screen. A
 *  wide panel goes back to the side before anything closes (wide panel WD13). */
export function columnEscAction(e: {
  key: string;
  defaultPrevented: boolean;
  inColumn: boolean;
  fieldHasText: boolean;
  locked: boolean;
  wide?: boolean;
}): 'none' | 'blur' | 'collapse' | 'close' {
  if (e.key !== 'Escape' || e.defaultPrevented || !e.inColumn) return 'none';
  if (e.fieldHasText) return 'blur';
  if (e.wide) return 'collapse';
  return e.locked ? 'none' : 'close';
}

/** Give focus back to the pill after the column closes, when it is a button.
 *  When the close waits on Edit agent's "Discard changes?", only after it. The
 *  pill hides while the column shows (needs-you-pill-hides.md), so it comes
 *  back on the next render: wait a frame for it. */
export function focusNeedsYouPill(): void {
  afterLeave(() => requestAnimationFrame(() => document.getElementById(NEEDS_YOU_PILL_ID)?.focus()));
}

/** Whether the top bar's Needs you pill hides (docs/designs/needs-you-pill-hides.md,
 *  D1): while the column shows on the current view (the board, a person's panel
 *  or the minimized strip), each of which shows the count already. The column
 *  shows on the office and file tabs only, as App's `columnView` rule. */
export function pillHidden(rightColumn: 'closed' | 'board' | 'person', floorView: string): boolean {
  return rightColumn !== 'closed' && (floorView === 'office' || floorView === 'file');
}

/** Whether the minimized column's strip pulses for this count change: only when
 *  the count rises, so a new ask is noticed without the column opening
 *  (docs/designs/needs-you-minimize.md, D3). A fall (an answer) or the first
 *  read never pulses. */
export function railPulses(prev: number | null, next: number): boolean {
  return prev !== null && next > prev;
}
