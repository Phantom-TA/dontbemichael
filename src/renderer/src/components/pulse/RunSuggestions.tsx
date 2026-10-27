import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RunSuggestion } from '@shared/runCompare';
import { useStore } from '@/store/store';
import { useResolvedGodName } from '@/hooks/useResolvedGodName';
import { useMissions } from '../triggers/ScheduleList';
import { AgentAvatar } from '../AgentAvatar';
import { PixelButton } from '../PixelButton';

/** How often the cards are read again while Pulse is open: a comparison
 *  started from the jobs list lands here without a reload. */
const REFRESH_MS = 30_000;

/**
 * Pulse's cards for run comparisons (src/shared/runCompare.ts, eng D1 B):
 * "Michael suggests a change" to a member's job, from comparing a run the
 * owner marked "Went wrong" with an earlier one that went well. Review the
 * change opens Edit agent with What should change? filled in, where the
 * owner sees the rewrite and Apply or Undo; Not now hides the card. A card
 * leaves once the member's job has changed since it was made.
 */
export function RunSuggestions({ onShown }: { onShown?: (n: number) => void } = {}) {
  const { t } = useTranslation();
  const godName = useResolvedGodName();
  const agents = useStore((s) => s.agents);
  const requestEditAgent = useStore((s) => s.requestEditAgent);
  const { missions } = useMissions();
  const [items, setItems] = useState<RunSuggestion[]>([]);

  const load = useCallback(async () => {
    try { setItems(await window.cth.runCompareSuggestions()); } catch { /* the cards wait for the next read */ }
  }, []);
  useEffect(() => {
    void load();
    const id = window.setInterval(() => { void load(); }, REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const shown = items.filter((s) => {
    const a = agents.find((x) => x.id === s.agentId);
    if (!a || a.archived) return false;
    // Applied (or changed another way) since the suggestion: nothing left to review.
    return !(a.jobChanges ?? []).some((c) => (Date.parse(c.at) || 0) > s.at);
  });
  // Pulse leaves out "Nothing to change" while a card is up.
  useEffect(() => { onShown?.(shown.length); }, [onShown, shown.length]);
  if (!shown.length) return null;

  const notNow = async (s: RunSuggestion): Promise<void> => {
    await window.cth.runCompareDismiss(s.runId).catch(() => false);
    await load();
  };

  return (
    <div role="list" aria-label={t('runCompare.cardsLabel', { godName })} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {shown.map((s) => {
        const name = agents.find((x) => x.id === s.agentId)?.name ?? s.agentId;
        const job = missions.find((m) => m.id === s.missionId)?.label ?? '';
        return (
          <div key={s.runId} role="listitem" style={{ background: 'var(--cth-amber-soft)', borderRadius: 'var(--cth-r-xl)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--cth-amber) 40%, transparent)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <AgentAvatar id={s.agentId} name={name} size={22} />
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: '18px' }}>
                {job ? t('runCompare.title', { godName, name, job }) : t('runCompare.titleNoJob', { godName, name })}
              </div>
            </div>
            <div dir="auto" style={{ fontSize: 13, lineHeight: '19px', color: 'var(--cth-ink)' }}>{s.change}</div>
            {s.why && <div dir="auto" style={{ fontSize: 12, lineHeight: '17px', color: 'var(--cth-amber-text)' }}>{s.why}</div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <PixelButton size="sm" onClick={() => requestEditAgent(s.agentId, { change: s.change })}>{t('runCompare.review')}</PixelButton>
              <PixelButton variant="secondary" size="sm" onClick={() => { void notNow(s); }}>{t('pulse.notNow')}</PixelButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
