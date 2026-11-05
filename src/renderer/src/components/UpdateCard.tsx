import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { APP_NAME } from '@shared/appName';
import { summarizeReleaseNotes } from '@shared/releaseNotes';
import { REPO_URL, updateCardShown, type UpdateNeed } from '@shared/updateState';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useStore } from '@/store/store';
import { putOffUpdate } from '@/shell/useNeedsYou';
import { AgentAvatar } from './AgentAvatar';
import { PixelButton } from './PixelButton';
import { fieldLabel } from './fieldText';

/**
 * A new version of the app, as Michael's card on Ask me (owner, 2026-11-04:
 * the corner popup with Later and Restart should be an Ask me card sent by
 * Michael). It replaces the corner toast for the two states the owner acts on:
 *   - 'downloaded'        → Restart to update.
 *   - 'available-manual'  → this install can't update itself: Download.
 *
 * The app makes this card, as it does Get Michael ready: nothing goes in
 * tasks.json, so no agent can write it, answer it or restart the app through
 * it, and the restart stays the owner's click (the app never restarts on its
 * own). It counts in the Ask me pill like any open ask (useNeedsYou).
 *
 * Later takes it off Ask me for this version until the app starts again; a
 * newer version asks again. The title bar badge and Settings, Updates still
 * offer the restart meanwhile. An authored release page (the drop) still opens
 * centered from UpdateToast: it has no buttons, and this card keeps the action.
 *
 * The star ask is shown AT MOST ONCE EVER, not once per release: a repeated ask
 * is the kind of nagging that gets the update channel ignored (STAR_ASK_KEY).
 */
export function UpdateCard({ update, later }: { update: UpdateNeed | null; later: string | null }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const godId = useStore((s) => s.agents.find((a) => a.isGod)?.id);
  // While a restart is asked for, the card steps aside: the quit warning (when
  // agents are working) is the one thing to read. A cancel brings it back.
  const [restarting, setRestarting] = useState(false);
  // Read once per window, so persisting the flag cannot pull the link out from
  // under the cursor of the person reading it.
  const [starAsk] = useState(starAskPending);
  /** The version the ask was spent on: it stays on that card, and no later one. */
  const [starSpentOn, setStarSpentOn] = useState<string | null>(null);
  const notes = useMemo(() => summarizeReleaseNotes(update?.notes), [update?.notes]);
  const version = update?.version ?? null;
  const shown = updateCardShown(update, later) && !restarting;
  // Shown = spent: an ask read and ignored is an answer too.
  const showStar = shown && starAsk && notes.length > 0 && (starSpentOn === null || starSpentOn === version);
  useEffect(() => {
    if (showStar && version && starSpentOn === null) {
      setStarSpentOn(version);
      markStarAsked();
    }
  }, [showStar, version, starSpentOn]);

  if (!update || !shown) return null;

  /** Step the card aside FIRST, then ask main to quit and install. A restart
   *  main could not do, or the owner called off at the quit warning, brings the
   *  card back; a status main pushed meanwhile (an install it refused comes
   *  back as the manual download) is what the card then shows. */
  const restart = async () => {
    setRestarting(true);
    try {
      const res = await window.cth.updateRestartAndInstall();
      if (!res.ok) setRestarting(false);
    } catch { setRestarting(false); }
  };

  /** Main resolves `undefined` to the releases page and refuses any URL
   *  outside this repo. */
  const openRelease = () => {
    void window.cth.updateOpenRelease(
      update.state === 'available-manual' ? (update.downloadUrl ?? update.url) : undefined
    );
  };
  const hasDownload = update.state === 'available-manual' && !!update.downloadUrl;
  const title = update.state === 'downloaded'
    ? t('updateToast.downloadedTitle', { version: update.version })
    : t('updateToast.availableTitle', { version: update.version });

  return (
    <section aria-label={title} data-askme-id="app-update" style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{title}</div>
      {/* From Michael, like every ask: only Michael speaks to the owner. */}
      <div style={{ marginTop: 6 }}>
        <span style={personChip}><AgentAvatar id={godId} name={godName} size={16} />{godName}</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>
        {update.state === 'downloaded' ? t('updateToast.downloadedBody', { app: APP_NAME }) : t('updateToast.manualBody')}
      </p>

      {notes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
          <div style={fieldLabel}>{t('updateToast.whatsNew')}</div>
          {/* The digest is capped at about 280 characters; the clamp is the
              second belt, for the day a release body defeats the parser. */}
          <ul style={{ listStyle: 'none', margin: 0, padding: '0 0 0 2px', maxHeight: 96, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {notes.map((line, i) => (
              <li key={i} style={{ display: 'flex', gap: 6, fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink-2)' }}>
                <span aria-hidden style={{ color: 'var(--cth-ink-4)' }}>•</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href={update.state === 'available-manual' ? update.url : RELEASES_URL}
              onClick={(e) => { e.preventDefault(); openRelease(); }} style={linkStyle}>{t('updateToast.readMore')}</a>
            {showStar && (
              <a href={REPO_URL} onClick={(e) => { e.preventDefault(); void window.cth.openExternal(REPO_URL); }}
                style={linkStyle}>{t('updateToast.star')}</a>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
        <PixelButton variant="secondary" size="sm" onClick={() => putOffUpdate(update.version)}>{t('updateToast.later')}</PixelButton>
        {update.state === 'downloaded' ? (
          <PixelButton variant="primary" size="sm" onClick={() => void restart()}>{t('updateToast.restart')}</PixelButton>
        ) : (
          <PixelButton variant="primary" size="sm" onClick={openRelease}>
            {hasDownload ? t('updateToast.download', { version: update.version }) : t('updateToast.openReleases')}
          </PixelButton>
        )}
      </div>
    </section>
  );
}

/** Only ever the `href`: the click goes through `updateOpenRelease`. */
const RELEASES_URL = `${REPO_URL}/releases/latest`;

/** One time flag for the star ask, in the `cth.` renderer memory that "reset
 *  and start over" clears: a wiped install is a new owner not yet asked. */
const STAR_ASK_KEY = 'cth.updateStarAsked';

function starAskPending(): boolean {
  try {
    return window.localStorage.getItem(STAR_ASK_KEY) !== '1';
  } catch {
    // Without storage "at most once, ever" can't hold, so ask zero times.
    return false;
  }
}

function markStarAsked(): void {
  try { window.localStorage.setItem(STAR_ASK_KEY, '1'); } catch { /* nothing to do */ }
}

// The Ask me card look (AskMeTab), opened: Michael's update is a decision.
const card: CSSProperties = {
  position: 'relative', flexShrink: 0, padding: '13px 14px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
};
const personChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px 0 3px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
const linkStyle: CSSProperties = {
  fontSize: 12.5, lineHeight: '17px', color: 'var(--cth-indigo-text)',
  textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer'
};
