/**
 * The case study's events from main, on any view (docs/designs/case-study.md).
 * Mounted once in App.tsx; it draws nothing.
 *
 * A case study prepared in the background used to say it was ready in a corner
 * toast that left after 15 seconds, so an owner looking away missed it. It is
 * now Michael's card on Ask me (CaseStudyCard, owner 2026-11-04), which stays
 * until the owner opens it or chooses Later. What stays here:
 *   - where main's preparation stands when the window (re)loads;
 *   - ready while the screen is open: the screen takes it in place, so it no
 *     longer waits on Ask me;
 *   - a click on Michael's desktop notice opens the screen, filled in.
 */
import { useEffect } from 'react';
import { useStore } from '@/store/store';

export function CaseStudyEvents(): null {
  const setPrep = useStore((s) => s.setCaseStudyPrep);
  const setOpen = useStore((s) => s.setCaseStudyOpen);
  const setFloorView = useStore((s) => s.setFloorView);

  useEffect(() => {
    void window.cth.caseStudyStatus().then((p) => setPrep(p.state)).catch(() => undefined);
    const offReady = window.cth.onCaseStudyReady(() => {
      setPrep('ready');
      if (useStore.getState().caseStudyOpen) void window.cth.caseStudySeen?.().catch(() => undefined);
    });
    const offShow = window.cth.onCaseStudyShow(() => { setFloorView('pulse'); setOpen(true); });
    return () => { offReady(); offShow(); };
  }, [setPrep, setOpen, setFloorView]);

  return null;
}
