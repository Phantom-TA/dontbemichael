/**
 * Who has the center of the window (the wide 1:1, design review 2026-10-17,
 * 8A): the conversation with Michael or a wide person's or Michael's panel,
 * never both. Whatever the owner opened last takes it; the other goes back to
 * the side for now, and neither remembered wide choice changes (7A). The
 * Needs you board and a panel at the side sit beside the wide 1:1, never under
 * it: a question there may be what the owner asks Michael (owner, 2026-10-17).
 *
 * Pure, with no imports, so the tests load it as it runs.
 */

/** The last owner action that opened something: the 1:1, or the right column
 *  (a person, Michael's panel, or the Needs you board). */
export type CenterClaim = 'dock' | 'column' | null;

export interface DockCenterState {
  dockOpen: boolean;
  /** The owner's remembered choice for the 1:1 (1A), set only by its button. */
  dockWide: boolean;
  /** Esc sent it back to the side for now (6B, 7A); cleared when it closes. */
  dockSideForNow: boolean;
  /** A person's or Michael's panel is open and the owner chose wide for panels. */
  panelWideOpen: boolean;
  claim: CenterClaim;
}

/** The 1:1 is wide in the center. */
export function dockCentered(s: DockCenterState): boolean {
  if (!s.dockOpen || !s.dockWide || s.dockSideForNow) return false;
  return !(s.claim === 'column' && s.panelWideOpen);
}

/** A person's or Michael's panel is wide in the center: the owner chose wide
 *  for panels, one is open, and the 1:1 does not hold the center. */
export function panelCentered(s: { panelWide: boolean; panelOpen: boolean; dockCentered: boolean }): boolean {
  return s.panelWide && s.panelOpen && !s.dockCentered;
}

/** Esc in the 1:1 (6B): wide, it goes back to the side for now, from the
 *  message box too; at the side, Esc inside the conversation closes it, and
 *  Esc in the message box does nothing, as before. */
export function dockEscAction(e: { wide: boolean; inDock: boolean; composing: boolean }): 'side' | 'close' | 'none' {
  if (e.composing) return 'none';
  if (e.wide) return 'side';
  return e.inDock ? 'close' : 'none';
}

/** A file shown while the 1:1 is wide takes the center (open-file-from-wide-dock.md,
 *  decisions 1 and 4, rule 8A for files): the 1:1 goes to the side for now, and
 *  the note says the file moved it, so closing the file can bring it back. Esc's
 *  own side, a closed 1:1 or one chosen narrow are left as they are. */
export function fileShownPatch(s: { dockOpen: boolean; dockWide: boolean; dockSideForNow: boolean }): { dockSideForNow: true; dockAsideForFile: true } | null {
  return s.dockOpen && s.dockWide && !s.dockSideForNow ? { dockSideForNow: true, dockAsideForFile: true } : null;
}

/** After a file tab closes (decision 2): when no file is shown any more and a
 *  file moved the 1:1, it comes back wide. Another file still shown, or a side
 *  the owner chose with Esc, keeps it at the side. */
export function fileClosedPatch(s: { dockAsideForFile: boolean }, viewAfter: string): { dockSideForNow: false; dockAsideForFile: false } | null {
  return s.dockAsideForFile && viewAfter !== 'file' ? { dockSideForNow: false, dockAsideForFile: false } : null;
}

/** The element id of the center host the wide 1:1 is drawn into (App.tsx). */
export const DOCK_CENTER_ID = 'cth-dock-center';
