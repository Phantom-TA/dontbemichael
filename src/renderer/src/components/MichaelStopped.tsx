import { useTranslation } from 'react-i18next';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { OpeningCard } from './OpeningCard';
import { PixelButton } from './PixelButton';

/**
 * Michael's terminal ended by itself (owner, 2026-10-30: a first time owner's
 * Michael exited at once on an unknown option, and nothing outside his Work
 * tab said so). The floor says he stopped, with the line his terminal printed,
 * until he starts again. The opening's card, in amber, so it reads as the same
 * office telling you what happened.
 */
export function MichaelStopped({ show }: { show: boolean }) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const stopped = useStore((s) => Object.values(s.stopped).find((m) => m.isMichael));
  // Start again is under way: the clocking in card takes over.
  const starting = useStore((s) => s.godStatus === 'booting');
  if (!show || !stopped || starting) return null;
  const title = t('office.stopped.title', { name: godName });
  return (
    <OpeningCard tone="amber" title={title} say={title}
      line={stopped.line
        ? <span dir="ltr" style={{ fontFamily: 'var(--cth-font-mono)', unicodeBidi: 'isolate' }}>{stopped.line}</span>
        : t('office.stopped.noLine', { name: godName })}
      actions={<>
        <PixelButton variant="primary" size="sm" onClick={() => useStore.getState().requestMichaelStart()}>{t('office.stopped.startAgain')}</PixelButton>
        <PixelButton variant="secondary" size="sm" onClick={() => useStore.getState().openAgentWork(stopped.agentId)}>{t('office.stopped.seeWork')}</PixelButton>
      </>} />
  );
}
