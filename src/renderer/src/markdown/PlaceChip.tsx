/**
 * A place in the app named in agent text, as a button
 * (docs/designs/settings-links-in-replies.md): "Settings, Connections,
 * Mailboxes" opens Settings there, scrolled to the group and unfolded;
 * "Connect your email" opens the Add a mailbox form; a member link opens
 * that member's Access tab at Email. Same shape as a file chip.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Place } from '@shared/settingsPlaces';
import { Icon } from '@/components/Icon';
import { useStore } from '@/store/store';

/** Settings' open state lives in App, so a place opens through its window
 *  event (App.tsx); a member opens through the store. The Settings window
 *  covers the app while open, so no chip can be clicked behind it. */
export function openPlace(place: Place): void {
  if (place.kind === 'settings') {
    window.dispatchEvent(new CustomEvent('cth:open-settings', { detail: { section: place.section, group: place.group, add: place.add } }));
    return;
  }
  useStore.getState().openAgentEmail(place.agentId);
}

export function PlaceChip({ place, children, words }: { place: Place; children: ReactNode; words: string }) {
  const { t } = useTranslation();
  // A member that is gone shows as the words alone: nothing to open.
  const known = useStore((s) => place.kind !== 'member' || s.agents.some((a) => a.id === place.agentId));
  if (!known) return <>{children}</>;
  return (
    <button
      type="button"
      className="cth-file-chip"
      // Copying the text keeps these words (fileTabCopy.ts).
      data-copy="words"
      onClick={() => openPlace(place)}
      aria-label={t('markdown.openPlace', { place: words })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle', maxWidth: '100%',
        height: 24, padding: '0 8px', margin: '1px 0', border: 0, borderRadius: 'var(--cth-r-sm)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500, lineHeight: '24px', whiteSpace: 'nowrap',
        background: 'var(--cth-neutral-soft)', color: 'var(--cth-indigo-text)', cursor: 'pointer'
      }}
    >
      <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid', placeItems: 'center' }}><Icon name={place.kind === 'member' ? 'lock' : 'gear'} size={0.875} /></span>
      <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', unicodeBidi: 'isolate' }}>{children}</span>
    </button>
  );
}
