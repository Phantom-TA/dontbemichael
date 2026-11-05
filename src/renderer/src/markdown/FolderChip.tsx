/**
 * A team folder named on a card, as a button (remarkFolderChips). It carries a
 * member id, never a path: main opens the folder its settings name, and shows
 * one it only knows from the registry (fs:openAgentFolder). A member who is
 * gone, or a folder that is, leaves the words alone: nothing to open.
 */
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useStore } from '@/store/store';
import { placeChipStyle } from './PlaceChip';

export function FolderChip({ agentId, children, words }: { agentId: string; children: ReactNode; words: string }) {
  const { t } = useTranslation();
  const known = useStore((s) => s.agents.some((a) => a.id === agentId));
  const [gone, setGone] = useState(false);
  if (!known || gone) return <>{children}</>;
  const open = (): void => {
    void window.cth.openAgentFolder(agentId)
      .then((r) => { if (!r.ok) setGone(true); })
      .catch(() => setGone(true));
  };
  return (
    <button
      type="button"
      className="cth-file-chip"
      // Copying the text keeps these words (fileTabCopy.ts).
      data-copy="words"
      onClick={open}
      aria-label={t('markdown.openPlace', { place: words })}
      style={placeChipStyle}
    >
      <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid', placeItems: 'center' }}><Icon name="folder" size={0.875} /></span>
      <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', unicodeBidi: 'isolate' }}>{children}</span>
    </button>
  );
}
