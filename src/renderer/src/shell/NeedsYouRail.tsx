import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useStore } from '@/store/store';
import { useDockCentered } from '@/hooks/useCenter';
import { useNeedsYouCount } from './useNeedsYou';
import { railPulses } from './rightColumn';

/** The minimized column's width: the tab or office takes the rest. */
export const RAIL_W = 44;

/**
 * The Needs you column minimized (docs/designs/needs-you-minimize.md): a slim
 * strip on the right edge, so a report reads at nearly the full width while
 * every waiting ask stays in sight (D12 of needs-you-empty-state.md holds). The
 * coral count, and one click to open the column again where it was. The column
 * itself stays mounted and hidden meanwhile, so a terminal or a half written
 * reply survives (E1).
 */
export function NeedsYouRail() {
  const { t } = useTranslation();
  const count = useNeedsYouCount();
  const prev = useRef<number | null>(null);
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    if (railPulses(prev.current, count)) setPulse((n) => n + 1);
    prev.current = count;
  }, [count]);
  const label = count > 0 ? t('shell.railOpenCount', { count }) : t('shell.railOpen');
  return (
    <button
      type="button"
      data-needs-you-rail
      onClick={() => useStore.getState().setColumnMinimized(false)}
      aria-label={label}
      title={label}
      style={{
        width: RAIL_W, flexShrink: 0, margin: '4px 6px 0 0', padding: '12px 0', border: 'none', cursor: 'pointer',
        borderRadius: 'var(--cth-r-xl) var(--cth-r-xl) 0 0', background: 'var(--cth-card)',
        boxShadow: 'inset 1px 0 0 var(--cth-line), var(--cth-shadow-md)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, color: 'var(--cth-ink-3)', zIndex: 60
      }}
    >
      <Icon name="sidebar" size={1} />
      {count > 0 && (
        <span key={pulse} className={pulse ? 'cth-rail-pulse' : undefined} style={{
          minWidth: 22, height: 22, padding: '0 6px', borderRadius: 'var(--cth-r-pill)', display: 'inline-grid', placeItems: 'center',
          background: 'var(--cth-coral-strong)', color: 'var(--cth-on-coral)',
          fontFamily: 'var(--cth-font-mono)', fontSize: 11, fontWeight: 600
        }}>{count}</span>
      )}
    </button>
  );
}

/** The column header's minimize button (needs-you-minimize.md, D2), on the
 *  Needs you board and a person's panel. Not while a panel is wide (E4): wide
 *  goes back to the side first. `size` matches the header it sits in. */
export function MinimizeColumnButton({ size = 32 }: { size?: number }) {
  const { t } = useTranslation();
  const dockWide = useDockCentered();
  const panelWide = useStore((s) => s.panelWide && s.rightColumn === 'person') && !dockWide;
  if (panelWide) return null;
  const label = t('shell.minimizeColumn');
  return (
    <button
      type="button"
      data-minimize-column
      onClick={() => useStore.getState().setColumnMinimized(true)}
      aria-label={label}
      title={label}
      style={{
        width: size, height: size, padding: 0, display: 'inline-grid', placeItems: 'center', flexShrink: 0, border: 'none', cursor: 'pointer',
        borderRadius: 'var(--cth-r-md)', background: 'var(--cth-card)', boxShadow: 'inset 0 0 0 1px var(--cth-line-2)', color: 'var(--cth-ink-2)'
      }}
    >
      <Icon name="sidebar" />
    </button>
  );
}
