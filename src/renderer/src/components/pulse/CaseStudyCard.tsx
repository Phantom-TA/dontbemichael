import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useStore } from '@/store/store';
import { AgentAvatar } from '../AgentAvatar';
import { PixelButton } from '../PixelButton';

/**
 * A case study prepared in the background is ready, as Michael's card on Ask
 * me (owner, 2026-11-04: the corner popup that left after 15 seconds could be
 * missed). It stays until the owner opens it, from here or from Pulse, or
 * chooses Later; main keeps that (CaseStudyService.seen), so a reloaded window
 * still shows it. Like the update card it is the app's own: nothing goes in
 * tasks.json, and it counts in the Ask me pill (useNeedsYou).
 */
export function CaseStudyCard({ waiting }: { waiting: boolean }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const godId = useStore((s) => s.agents.find((a) => a.isGod)?.id);
  const screenOpen = useStore((s) => s.caseStudyOpen);
  const setOpen = useStore((s) => s.setCaseStudyOpen);
  const setFloorView = useStore((s) => s.setFloorView);
  if (!waiting || screenOpen) return null;

  const title = t('caseStudy.readyTitle');
  // Opening the screen tells main it has been seen (caseStudy:open).
  const view = () => { setFloorView('pulse'); setOpen(true); };
  const later = () => { void window.cth.caseStudySeen?.().catch(() => undefined); };

  return (
    <section aria-label={title} data-askme-id="case-study-ready" style={card}>
      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px', letterSpacing: '-0.01em', color: 'var(--cth-ink)' }}>{title}</div>
      {/* From Michael, like every ask: only Michael speaks to the owner. */}
      <div style={{ marginTop: 6 }}>
        <span style={personChip}><AgentAvatar id={godId} name={godName} size={16} />{godName}</span>
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 12.5, lineHeight: '18px', color: 'var(--cth-ink)' }}>{t('caseStudy.readyBody')}</p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 12 }}>
        <PixelButton variant="secondary" size="sm" onClick={later}>{t('caseStudy.readyLater')}</PixelButton>
        <PixelButton variant="primary" size="sm" onClick={view}>{t('caseStudy.readyView')}</PixelButton>
      </div>
    </section>
  );
}

// The Ask me card look (AskMeTab), opened.
const card: CSSProperties = {
  position: 'relative', flexShrink: 0, padding: '13px 14px', borderRadius: 'var(--cth-r-xl)',
  background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2), var(--cth-shadow-md)'
};
const personChip: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5, height: 22, padding: '0 9px 0 3px', borderRadius: 'var(--cth-r-pill)',
  background: 'var(--cth-neutral-soft)', fontSize: 11.5, fontWeight: 600, color: 'var(--cth-ink-2)'
};
