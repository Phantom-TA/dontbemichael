import type { DockItem } from '@shared/ownerRequests';

/**
 * Which questions the conversation shows (docs/designs/dock-latest-exchange.md).
 * It opens on the owner's latest question, so they never hunt for it under old
 * answers, along with anything still open or holding an unread reply. The rest
 * waits behind Show earlier.
 *
 * Unread and open both end while the owner reads (a reply on screen is marked
 * read at once), so the choice is made when the owner opens the dock or sends,
 * and until the next of those it only grows: nothing folds under them.
 */
export interface DockFold {
  navigation: number | undefined;
  /** A question just sent, not in the list yet: the fold starts over when it lands. */
  waitingFor?: string;
  shown: ReadonlySet<string>;
}

export const NO_FOLD: DockFold = { navigation: undefined, shown: new Set() };

function quietView(items: DockItem[]): Set<string> {
  const shown = new Set<string>();
  let latest: string | undefined;
  for (const it of items) {
    if (it.kind !== 'owner') continue;
    latest = it.id;
    const done = it.status === 'answered' || it.status === 'couldnt-finish' || it.status === 'withdrawn';
    if (!done || it.unread) shown.add(it.id);
  }
  if (latest) shown.add(latest);
  return shown;
}

/** The fold after this snapshot. The same one back when nothing changed. */
export function nextFold(prev: DockFold, items: DockItem[], navigation: number, focus: string | undefined): DockFold {
  const navigated = prev.navigation !== navigation;
  const landed = !navigated && !!prev.waitingFor && items.some((it) => it.id === prev.waitingFor);
  const quiet = quietView(items);
  if (navigated || landed) {
    const waitingFor = navigated && focus && !items.some((it) => it.id === focus) ? focus : undefined;
    return { navigation, waitingFor, shown: quiet };
  }
  if ([...quiet].every((id) => prev.shown.has(id))) return prev;
  return { ...prev, shown: new Set([...prev.shown, ...quiet]) };
}

/** Replies stay with their question. */
export function foldedItems(items: DockItem[], shown: ReadonlySet<string>): DockItem[] {
  return items.filter((it) => shown.has(it.kind === 'owner' ? it.id : it.replyTo));
}
