/**
 * The owner's Claude plan and what it costs (owner, 2026-10-15): on a plan,
 * Pulse shows what the office's own work cost of the plan's real price,
 * instead of what the same work would cost per use.
 *
 * The plan is shared with everything else the owner does with Claude, so the
 * office is never charged the whole plan (owner, 2026-10-29). Its work is
 * priced at the plan's rate: the price over what a full plan's work is worth
 * per use. That capacity is learned from the account's weekly usage meter,
 * which counts the account's use on every computer and in every app.
 *
 * The plan is read from Claude Code's own account record (plan fields only,
 * never a token); the owner can set the price in Settings, which wins. Prices
 * are the published monthly list prices and can drift, which is why the
 * owner's own figure always comes first.
 *
 * No electron or node imports: main and the renderer share it, tests load it.
 */
import type { PulseSnapshot } from './teamPerformance';
import { CostFold } from './costFold';

export type ClaudePlanId = 'pro' | 'max-5x' | 'max-20x' | 'team' | 'enterprise';

/** Monthly list price in USD, or null where it depends on seats and terms. */
export const PLAN_PRICES: Record<ClaudePlanId, number | null> = {
  pro: 20,
  'max-5x': 100,
  'max-20x': 200,
  team: null,
  enterprise: null
};

export const PLAN_LABELS: Record<ClaudePlanId, string> = {
  pro: 'Claude Pro',
  'max-5x': 'Claude Max 5x',
  'max-20x': 'Claude Max 20x',
  team: 'Claude Team',
  enterprise: 'Claude Enterprise'
};

/** The plan from Claude Code's account record (its organization type and rate
 *  limit tier), or null when it is not a plan this table knows. */
export function planFromAccount(acct: { organizationType?: unknown; organizationRateLimitTier?: unknown; userRateLimitTier?: unknown } | null | undefined): ClaudePlanId | null {
  if (!acct) return null;
  const type = String(acct.organizationType ?? '').toLowerCase();
  const tier = `${String(acct.organizationRateLimitTier ?? '')} ${String(acct.userRateLimitTier ?? '')}`.toLowerCase();
  if (type.includes('max') || tier.includes('max')) return tier.includes('20x') ? 'max-20x' : 'max-5x';
  if (type.includes('pro')) return 'pro';
  if (type.includes('team')) return 'team';
  if (type.includes('enterprise')) return 'enterprise';
  return null;
}

/** The plan Pulse prices by: the owner's price first, else the detected plan's list price. */
export interface PlanPrice { plan: ClaudePlanId | null; label: string | null; monthly: number; source: 'owner' | 'detected' }

export function planPrice(detected: ClaudePlanId | null, ownerMonthly: number | undefined | null): PlanPrice | null {
  const label = detected ? PLAN_LABELS[detected] : null;
  if (typeof ownerMonthly === 'number' && Number.isFinite(ownerMonthly) && ownerMonthly > 0) return { plan: detected, label, monthly: ownerMonthly, source: 'owner' };
  const list = detected ? PLAN_PRICES[detected] : null;
  return list ? { plan: detected, label, monthly: list, source: 'detected' } : null;
}

export const DAYS_PER_MONTH = 365.25 / 12;

/** The plan's cost for the part of [fromMs, toMs] that has passed by `now`. */
export function planCostFor(monthly: number, fromMs: number, toMs: number, now: number): number {
  const elapsed = Math.max(0, Math.min(now, toMs) - fromMs);
  return (monthly * elapsed) / (DAYS_PER_MONTH * 86_400_000);
}

/** A reading of the account's weekly usage meter (status line `rate_limits.seven_day`). */
export interface MeterPoint { at: number; pct: number; resetsAt: number }
/** A cost sample: an agent session's running total (telemetry `cost`). */
export interface CostPoint { at: number; key: string; usd: number }

/** A stretch counts once the meter rose this many points in it, so a one point
 *  rounding step is a small part of it. */
export const MIN_METER_POINTS = 5;
/** Stretches from this far back count: a plan's limits can change. */
export const METER_LOOKBACK_MS = 28 * 86_400_000;

/**
 * The office's pay per use dollars for one point of the weekly meter: the
 * highest over stretches of one weekly window where the meter rose at least
 * MIN_METER_POINTS. The owner's other use in a stretch moves the meter with no
 * office dollars, so it can only lower a stretch's figure; the highest is the
 * stretch nearest the office alone. `seed` holds each session's last running
 * total before the first reading, so a long session is not counted whole.
 * Null until one stretch is long enough.
 */
export function usdPerMeterPoint(meter: MeterPoint[], costs: CostPoint[], seed: Record<string, number> = {}): number | null {
  const fold = new CostFold();
  for (const [key, usd] of Object.entries(seed)) fold.seed(key, usd);
  const incs = [...costs].sort((a, b) => a.at - b.at).map((c) => ({ at: c.at, usd: fold.add(c.key, c.usd) }));
  const between = (from: number, to: number): number => incs.reduce((s, c) => (c.at > from && c.at <= to ? s + c.usd : s), 0);
  const windows = new Map<number, MeterPoint[]>();
  for (const m of meter) {
    const key = Math.round(m.resetsAt / 3_600_000);
    windows.set(key, [...(windows.get(key) ?? []), m]);
  }
  let best: number | null = null;
  for (const points of windows.values()) {
    const sorted = points.sort((a, b) => a.at - b.at);
    let anchor = sorted[0];
    for (const p of sorted.slice(1)) {
      if (p.pct < anchor.pct) { anchor = p; continue; }
      const rose = p.pct - anchor.pct;
      if (rose < MIN_METER_POINTS) continue;
      const perPoint = between(anchor.at, p.at) / rose;
      if (perPoint > 0 && (best === null || perPoint > best)) best = perPoint;
      anchor = p;
    }
  }
  return best;
}

/** Plan dollars per pay per use dollar: the monthly price over what a full
 *  plan's month of work is worth per use (100 meter points a week). */
export function planRate(monthly: number, usdPerPoint: number): number {
  return monthly / (usdPerPoint * 100 * (DAYS_PER_MONTH / 7));
}

/** Every dollar in a snapshot times `factor`: the plan's rate, so each
 *  member's part is what their own work cost of the plan. */
export function scaleSnapshot(s: PulseSnapshot, factor: number): PulseSnapshot {
  const k = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : v * factor);
  return {
    ...s,
    totalUsd: s.totalUsd * factor,
    members: s.members.map((m) => ({
      ...m,
      usd: m.usd * factor,
      perPiece: Object.fromEntries(Object.entries(m.perPiece).map(([kind, v]) => [kind, (v as number) * factor])),
      costForWork: { ...m.costForWork, perPiece: k(m.costForWork.perPiece), usual: k(m.costForWork.usual) }
    }))
  };
}
