/**
 * The release page (the drop) for a new version, centered over the office.
 *
 * Main's updater (src/main/updater.ts) pushes its status over `update:status`.
 * The two states the owner acts on, 'downloaded' (restart to update) and
 * 'available-manual' (download it), no longer get a corner popup with Later and
 * Restart: they are Michael's card on Ask me (UpdateCard, owner 2026-11-04).
 *
 * What stays here is the authored release page: a <!-- drop --> block in the
 * release body opens it once, for a new version on its way or the one just
 * installed ('just-updated'). It carries no app buttons and its links go out
 * through the OS browser, so it never asks a question; the restart stays on the
 * Ask me card, the title bar badge and Settings, Updates. A release body with no
 * drop block (every one published so far) shows nothing here.
 */
import { useEffect, useMemo, useState } from 'react';
import { extractDropHtml } from '@shared/releaseDrop';
import { ReleaseDrop } from '@/components/ReleaseDrop';
import type { UpdateStatus } from '@shared/updateState';

type DropStatus = Extract<UpdateStatus, { state: 'downloaded' | 'available-manual' | 'just-updated' }>;

function droppable(s: UpdateStatus): DropStatus | null {
  return s.state === 'downloaded' || s.state === 'available-manual' || s.state === 'just-updated' ? s : null;
}

export function UpdateToast() {
  const [status, setStatus] = useState<DropStatus | null>(null);
  // The version whose page the owner closed: a re-check of it opens nothing.
  const [closed, setClosed] = useState<string | null>(null);

  useEffect(() => window.cth.onUpdateStatus?.((next) => {
    const d = droppable(next);
    // Only a new state with a page replaces one: a re-check never erases it.
    if (d) setStatus(d);
  }), []);

  // Main may have emitted before this window existed (a version just installed,
  // or the dev only MD_DROP_PREVIEW boot hook): pull the last status once.
  useEffect(() => {
    let alive = true;
    void window.cth.updateCurrent?.().then((cur) => {
      const d = droppable(cur);
      if (alive && d) setStatus((prev) => prev ?? d);
    }).catch(() => { /* nothing to show */ });
    return () => { alive = false; };
  }, []);

  const dropHtml = useMemo(() => extractDropHtml(status?.notes), [status?.notes]);
  const version = status?.version ?? null;
  if (!dropHtml || !version || closed === version) return null;
  return <ReleaseDrop version={version} html={dropHtml} onDismiss={() => setClosed(version)} />;
}

/** A small four point spark in indigo, the update mark (UpdateBadge). */
export function Spark() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0, color: 'var(--cth-indigo)' }}>
      <path fill="currentColor" d="M12 2.5l2.1 6.4 6.4 2.1-6.4 2.1L12 19.5l-2.1-6.4L3.5 11l6.4-2.1z" />
    </svg>
  );
}
