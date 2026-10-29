/**
 * One email, as it came, in an office tab (docs/designs/original-email-view.md).
 *
 * The subject leads, like a file tab (DD1); From, To, Cc and Date sit under it
 * as short rows; the body is the sender's own HTML on a white sheet in both
 * themes (DD2), inside a frame that can't run, navigate or reach the network
 * (shared/emailFrame.ts). Pictures from the web stay hidden until the owner
 * clicks Show pictures; main then fetches them (R2, R6). Opening never changes
 * the mailbox (R1). Main fetches the email on its own connection and answers
 * only this window's page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { emailHref, type OriginalEmail, type OriginalFailure } from '@shared/emailLink';
import { buildEmailFrame, remotePictureUrls } from '@shared/emailFrame';
import { useStore } from '@/store/store';
import type { FileTab } from '@/store/fileTabs';
import { openPlace } from '@/markdown/PlaceChip';
import { Icon } from './Icon';
import { PixelButton } from './PixelButton';

type Load =
  | { status: 'reading' }
  | { status: 'failed'; reason: OriginalFailure; gmailUrl: string | null }
  | { status: 'ok'; email: OriginalEmail; gmailUrl: string | null };

type Pictures = { status: 'hidden' } | { status: 'loading' } | { status: 'shown'; pictures: Record<string, string>; failed: number };

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon 27 Oct, 9:14 AM" in the Mac's own time. */
export function emailDate(iso: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  const time = `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${time}`;
}

export function EmailTabView({ tab }: { tab: FileTab }) {
  const { t } = useTranslation();
  const href = tab.email ? emailHref(tab.email) : null;
  const [load, setLoad] = useState<Load>({ status: 'reading' });
  const [tries, setTries] = useState(0);
  const [pics, setPics] = useState<Pictures>({ status: 'hidden' });
  const title = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    if (!href) { setLoad({ status: 'failed', reason: 'broken', gmailUrl: null }); return; }
    setLoad({ status: 'reading' });
    void window.cth.mailOriginal(href).then((r) => {
      if (!live) return;
      if (r.ok) {
        setLoad({ status: 'ok', email: r.email, gmailUrl: r.gmailUrl });
        if (r.email.subject.trim()) useStore.getState().retitleFileTab(tab.id, r.email.subject.trim());
      } else setLoad({ status: 'failed', reason: r.reason, gmailUrl: r.gmailUrl });
    }, () => { if (live) setLoad({ status: 'failed', reason: 'network', gmailUrl: null }); });
    // Closing the tab while it opens stops the open and its connection.
    return () => { live = false; void window.cth.mailOriginalCancel(href); };
  }, [href, tries, tab.id]);

  // Opening moves focus to the title, as a file tab does (DD7).
  useEffect(() => {
    const frame = requestAnimationFrame(() => title.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  const email = load.status === 'ok' ? load.email : null;
  const hasWebPictures = !!email?.html && remotePictureUrls(email.html).length > 0;
  const srcDoc = useMemo(() => (email
    ? buildEmailFrame({ html: email.html, text: email.text, inline: email.inline, pictures: pics.status === 'shown' ? pics.pictures : null })
    : ''), [email, pics]);

  const showPictures = () => {
    if (!href || pics.status !== 'hidden') return;
    setPics({ status: 'loading' });
    void window.cth.mailOriginalPictures(href).then(
      (r) => setPics({ status: 'shown', pictures: r.pictures, failed: r.failed }),
      () => setPics({ status: 'shown', pictures: {}, failed: 1 })
    );
  };
  const gmailUrl = load.status === 'reading' ? null : load.gmailUrl;
  const openGmail = gmailUrl ? <PixelButton variant="secondary" size="sm" onClick={() => void window.cth.openExternal?.(gmailUrl)}>{t('emailTab.openInGmail')}</PixelButton> : null;

  const headTitle = email ? (email.subject.trim() || t('emailTab.noSubject')) : tab.title;
  const meta = email ? email.mailboxAddress : load.status === 'reading' ? t('emailTab.opening') : '';
  const label = { fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-3)' } as const;
  const value = { fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-2)', margin: 0, overflowWrap: 'anywhere' as const };

  let body: React.ReactNode;
  if (load.status === 'reading') {
    body = (
      <div aria-hidden style={{ padding: '16px 20px' }}>
        {[60, 40, 85, 70].map((w) => <div key={w} style={{ height: 12, width: `${w}%`, borderRadius: 6, background: 'var(--cth-neutral-soft)', margin: '8px 0' }} />)}
      </div>
    );
  } else if (load.status === 'failed') {
    const r = load.reason;
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '28px 20px' }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--cth-ink-2)' }}>{t(`emailTab.failed.${r}`)}</p>
        {(r === 'network' || r === 'unknown') && <PixelButton variant="secondary" size="sm" onClick={() => setTries((n) => n + 1)}>{t('emailTab.tryAgain')}</PixelButton>}
        {(r === 'auth' || r === 'blocked') && <PixelButton variant="primary" size="sm" onClick={() => openPlace({ kind: 'settings', section: 'Connections', group: 'mailboxes' })}>{t('emailTab.openMailboxes')}</PixelButton>}
        {openGmail}
      </div>
    );
  } else {
    const e = load.email;
    body = (
      <>
        <dl className="cth-email-rows" style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', margin: 0, padding: '10px 20px', borderBottom: '1px solid var(--cth-line)' }}>
          <dt style={label}>{t('emailTab.from')}</dt>
          <dd dir="auto" style={value}>{e.fromName && <b style={{ color: 'var(--cth-ink)', fontWeight: 600 }}>{e.fromName} </b>}{e.fromAddress}</dd>
          <dt style={label}>{t('emailTab.to')}</dt>
          <dd dir="auto" style={value}>{e.to}</dd>
          {e.cc && <><dt style={label}>{t('emailTab.cc')}</dt><dd dir="auto" style={value}>{e.cc}</dd></>}
          {e.date && <><dt style={label}>{t('emailTab.date')}</dt><dd style={value}>{emailDate(e.date)}</dd></>}
        </dl>
        {(e.large || (hasWebPictures && !(pics.status === 'shown' && pics.failed === 0))) && (
          <div role="status" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 20px', fontSize: 12, color: 'var(--cth-ink-2)', background: 'var(--cth-card-2)', borderBottom: '1px solid var(--cth-line)' }}>
            {!e.large && <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid' }}><Icon name="image" size={0.875} /></span>}
            <span style={{ flex: 1 }}>{e.large ? t('emailTab.tooLarge') : pics.status === 'shown' ? t('emailTab.somePicturesFailed') : t('emailTab.picturesHidden')}</span>
            {!e.large && pics.status !== 'shown' && (
              <button type="button" onClick={showPictures} disabled={pics.status === 'loading'} style={{ background: 'none', border: 0, padding: 0, color: 'var(--cth-indigo-text)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--cth-font-ui)' }}>
                {t(pics.status === 'loading' ? 'emailTab.showingPictures' : 'emailTab.showPictures')}
              </button>
            )}
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0, padding: '16px 20px', background: 'var(--cth-bg)', overflow: 'auto', display: 'flex' }}>
          <iframe
            title={t('emailTab.frameTitle', { sender: e.fromName || e.fromAddress })}
            sandbox="allow-popups"
            referrerPolicy="no-referrer"
            srcDoc={srcDoc}
            style={{ flex: 1, minWidth: 320, minHeight: 360, border: 0, borderRadius: 'var(--cth-r-md)', background: '#FFFFFF', boxShadow: '0 0 0 1px var(--cth-line)' }}
          />
        </div>
        {e.attachments.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: '10px 20px 14px', borderTop: '1px solid var(--cth-line)', background: 'var(--cth-card)' }}>
            {e.attachments.map((a, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: '22px', color: 'var(--cth-ink-2)' }}>
                <span aria-hidden style={{ color: 'var(--cth-ink-3)', display: 'grid' }}><Icon name="file" size={0.875} /></span>
                <span dir="auto" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ fontSize: 11, color: 'var(--cth-ink-3)' }}>{sizeWords(a.size)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--cth-line)', background: 'var(--cth-card)' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div ref={title} tabIndex={-1} dir="auto" style={{ fontSize: 14, fontWeight: 600, color: 'var(--cth-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', outline: 'none' }}>{headTitle}</div>
          {meta && <div dir="auto" style={{ fontSize: 12, color: 'var(--cth-ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta}</div>}
        </div>
        {load.status === 'ok' && openGmail}
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'auto' }}>{body}</div>
    </div>
  );
}

function sizeWords(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
