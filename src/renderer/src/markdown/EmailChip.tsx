/**
 * An email named in agent text, as a chip (docs/designs/original-email-view.md,
 * DD3): the same chip as files and Settings places, with the mail icon. It
 * opens the email itself in an office tab, as it came from the owner's mailbox.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { emailTabId, type EmailRef } from '@shared/emailLink';
import { Icon } from '@/components/Icon';
import { useStore } from '@/store/store';

export function openEmail(ref: EmailRef, words: string): void {
  useStore.getState().openFileTab({ id: emailTabId(ref), title: words, kind: 'email', email: ref, who: {} });
}

export function EmailChip({ email, children, words }: { email: EmailRef; children: ReactNode; words: string }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="cth-file-chip"
      // Copying the text keeps these words (fileTabCopy.ts).
      data-copy="words"
      onClick={() => openEmail(email, words)}
      aria-label={t('emailTab.openEmail', { words })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, verticalAlign: 'middle', maxWidth: '100%',
        height: 24, padding: '0 8px', margin: '1px 0', border: 0, borderRadius: 'var(--cth-r-sm)',
        fontFamily: 'var(--cth-font-ui)', fontSize: 12, fontWeight: 500, lineHeight: '24px', whiteSpace: 'nowrap',
        background: 'var(--cth-neutral-soft)', color: 'var(--cth-indigo-text)', cursor: 'pointer'
      }}
    >
      <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid', placeItems: 'center' }}><Icon name="mail" size={0.875} /></span>
      <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', unicodeBidi: 'isolate' }}>{children}</span>
    </button>
  );
}
