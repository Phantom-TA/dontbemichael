/**
 * The case study's "ready" toast (docs/designs/case-study.md; owner,
 * 2026-11-03: prepare it in the background and say when it is ready). Mounted
 * once in App.tsx, so it shows on any view: View opens Pulse with the screen,
 * already filled in. A click on main's desktop notice opens it the same way.
 * Toast style per branding/DESIGN.md 7.23.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { PixelButton } from '../PixelButton';

const AUTO_DISMISS_MS = 15_000;

export function CaseStudyToast(): JSX.Element | null {
  const { t } = useTranslation();
  const setPrep = useStore((s) => s.setCaseStudyPrep);
  const setOpen = useStore((s) => s.setCaseStudyOpen);
  const setFloorView = useStore((s) => s.setFloorView);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // Where main's preparation stands when the window (re)loads.
    void window.cth.caseStudyStatus().then((p) => setPrep(p.state)).catch(() => undefined);
    const offReady = window.cth.onCaseStudyReady(() => {
      setPrep('ready');
      // The screen open already takes it in place; no toast over it.
      if (!useStore.getState().caseStudyOpen) setShown(true);
    });
    const offShow = window.cth.onCaseStudyShow(() => { setShown(false); setFloorView('pulse'); setOpen(true); });
    return () => { offReady(); offShow(); };
  }, [setPrep, setOpen, setFloorView]);

  useEffect(() => {
    if (!shown) return;
    const tm = setTimeout(() => setShown(false), AUTO_DISMISS_MS);
    return () => clearTimeout(tm);
  }, [shown]);

  if (!shown) return null;
  return (
    <div role="status" aria-live="polite" style={{
      position: 'fixed', insetInlineEnd: 16, bottom: 84, zIndex: 9998, maxWidth: 360,
      background: 'var(--cth-card)', border: '1px solid var(--cth-line)', borderRadius: 'var(--cth-r-xl)', boxShadow: 'var(--cth-shadow-lg)',
      padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div style={{ fontSize: 13, lineHeight: '18px', fontWeight: 600 }}>{t('caseStudy.readyTitle')}</div>
      <div style={{ fontSize: 12, lineHeight: '16.5px', color: 'var(--cth-ink-2)' }}>{t('caseStudy.readyBody')}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <PixelButton size="sm" onClick={() => { setShown(false); setFloorView('pulse'); setOpen(true); }}>{t('caseStudy.readyView')}</PixelButton>
        <PixelButton size="sm" variant="ghost" onClick={() => setShown(false)}>{t('caseStudy.readyLater')}</PixelButton>
      </div>
    </div>
  );
}
