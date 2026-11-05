/**
 * Rate limits from connected apps (TODOS: "Third-party rate-limit backoff in
 * the broker"). When an app answers 429, 503 with Retry-After, or a 403 that
 * says it is a rate limit (GitHub), the broker
 * stops calling it until the app's time is up, instead of every agent retrying
 * blind and burning quota. A short wait is held in the broker; a long one is
 * answered at once with when to try again.
 *
 * No electron / node imports: tests load it directly.
 */

/** Longest a call is held in the broker for a throttled app. */
export const HOLD_MAX_MS = 20_000;
/** A rate limit that does not say how long to wait: a bare 429, or a 403
 *  that says nothing is left but names no reset. */
export const DEFAULT_BACKOFF_MS = 30_000;
/** The longest wait the broker takes from an app. Past it, calls go again and
 *  a fresh 429 starts a new wait. */
export const BACKOFF_CAP_MS = 15 * 60_000;

type HeaderSource = { get(name: string): string | null };

/** True when a 403 is a rate limit, not a refusal. GitHub, the first app the
 *  broker connects, answers its limits with 403 as often as 429: the primary
 *  limit with `x-ratelimit-remaining: 0`, a secondary limit with Retry-After
 *  (docs.github.com, "Rate limits for the REST API"). A 403 with neither is
 *  a missing scope or permission, and waiting would not change it. */
function isRateLimited403(headers: HeaderSource): boolean {
  if (headers.get('retry-after')?.trim()) return true;
  const remaining = (headers.get('x-ratelimit-remaining') ?? headers.get('ratelimit-remaining'))?.trim();
  return remaining === '0';
}

/** How long a 429 or 503 answer (or a 403 that is a rate limit) asks callers
 *  to wait, in ms, or undefined when it is not a rate limit. Reads
 *  Retry-After (seconds or a date), then the common reset headers (seconds
 *  left, or a Unix time). A 503 that names no time is an outage, not a limit. */
export function backoffMs(status: number, headers: HeaderSource, now: number): number | undefined {
  if (status === 403 && !isRateLimited403(headers)) return undefined;
  if (status !== 429 && status !== 503 && status !== 403) return undefined;
  let ms: number | undefined;
  const retryAfter = headers.get('retry-after')?.trim();
  if (retryAfter) {
    if (/^\d+$/.test(retryAfter)) ms = Number(retryAfter) * 1000;
    else if (!Number.isNaN(Date.parse(retryAfter))) ms = Date.parse(retryAfter) - now;
  }
  if (ms === undefined) {
    const reset = (headers.get('ratelimit-reset') ?? headers.get('x-ratelimit-reset'))?.trim();
    if (reset && /^\d+$/.test(reset)) {
      const n = Number(reset);
      // A count of seconds, or a Unix time (GitHub style).
      ms = n > 1e9 ? n * 1000 - now : n * 1000;
    }
  }
  if (ms === undefined) return status === 503 ? undefined : DEFAULT_BACKOFF_MS;
  return Math.min(Math.max(ms, 1000), BACKOFF_CAP_MS);
}

/** When each connected app may be called again. */
export class ConnectionThrottle {
  private readonly until = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  /** Note an app's answer: a rate limit pushes its next call back. */
  note(id: string, status: number, headers: HeaderSource): void {
    const now = this.now();
    const ms = backoffMs(status, headers, now);
    if (ms !== undefined) this.until.set(id, Math.max(this.until.get(id) ?? 0, now + ms));
  }

  /** How long a call to `id` must still wait, in ms; 0 when it may go. */
  waitFor(id: string): number {
    const at = this.until.get(id);
    if (at === undefined) return 0;
    const left = at - this.now();
    if (left > 0) return left;
    this.until.delete(id);
    return 0;
  }
}
