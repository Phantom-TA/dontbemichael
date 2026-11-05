/**
 * Files automatic failure reports into the private reports repo
 * (docs/designs/auto-report-failures.md, Design > Filing).
 *
 *   pending row ─> known issue? ── yes ─> comment `seen-on …` (once per version)
 *                      │ no
 *                      └─> search "<fp> in:title" ── found ─> comment
 *                                                 └─ none ──> create issue
 *
 * Rows oldest first, every 10 minutes and a few minutes after start. The key ships in the app
 * (owner AP1) and reaches only REPORTS_REPO; nothing here takes another
 * target. No key (dev builds, tests) means nothing is ever called.
 */
import { createHash } from 'node:crypto';
import { REPORTS_REPO, fingerprintInput, issueBody, issueTitle, parseIssueBody, seenOnLine } from '../shared/failureReport';
import type { FailureReporter, LedgerRow } from './failureReport';

export const SEND_EVERY_MS = 10 * 60_000;
export const WRITES_PER_HOUR = 5;
export const WRITES_PER_DAY = 20;
export const SEARCHES_PER_HOUR = 5;
export const WAIT_DEFAULT_MS = 3600_000;
export const REQUEST_TIMEOUT_MS = 12_000;
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const API = 'https://api.github.com';

export type Verdict = 'ok' | 'stop' | 'wait' | 'drop' | 'retry' | 'gone';

/** What a GitHub status means for the sender (eng E-R4, OV10). `gone` is a
 *  404 or 410, which the caller reads as a deleted issue on a comment and as
 *  a missing repo elsewhere. Every office shares one key, so a secondary
 *  rate limit (a 403 whose message says so, often with no header) waits. */
export function classifyResponse(status: number, headers: { get(name: string): string | null }, message = ''): Verdict {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 401) return 'stop';
  if (status === 404 || status === 410) return 'gone';
  if (status === 429) return 'wait';
  if (status === 403) {
    const limited = headers.get('retry-after') !== null || headers.get('x-ratelimit-remaining') === '0' || /rate limit|abuse/i.test(message);
    return limited ? 'wait' : 'stop';
  }
  // Any other client error is about this one row: drop it, never block the rest.
  if (status >= 400 && status < 500) return 'drop';
  return 'retry';
}

export interface SenderDeps {
  key: string;
  appVersion: string;
  reporter: Pick<FailureReporter, 'pending' | 'issueFor' | 'markSent' | 'forgetIssue' | 'markDropped' | 'flush'>;
  fetch: (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown> }>;
  now: () => number;
  /** One line in the office log for the sender's own state changes. */
  log: (event: Record<string, unknown>) => void;
  timeout?: (ms: number) => AbortSignal | undefined;
}

/** The issue's fields hash to the fingerprint it claims (as the Action checks). */
function fingerprintHolds(r: ReturnType<typeof parseIssueBody>, fp: string): boolean {
  if (!r || r.fingerprint !== fp) return false;
  return createHash('sha256').update(fingerprintInput(r.kind, r.detail, r.errorName, r.frames)).digest('hex').slice(0, 12) === fp;
}

export function createFailureSender(deps: SenderDeps) {
  const writes: number[] = [];
  const searches: number[] = [];
  let running = false;
  let stopped = false;
  let waitUntil = 0;
  let retries = 0;

  const headers = (): Record<string, string> => ({
    authorization: `Bearer ${deps.key}`,
    accept: 'application/vnd.github+json',
    'x-github-api-version': '2022-11-28',
    'user-agent': 'dontbemichael',
    'content-type': 'application/json'
  });

  function used(list: number[], windowMs: number): number {
    const since = deps.now() - windowMs;
    return list.filter((t) => t > since).length;
  }
  const canWrite = () => used(writes, HOUR) < WRITES_PER_HOUR && used(writes, DAY) < WRITES_PER_DAY;
  const canSearch = () => used(searches, HOUR) < SEARCHES_PER_HOUR;

  async function call(method: string, path: string, body?: unknown) {
    const res = await deps.fetch(`${API}${path}`, {
      method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body), signal: deps.timeout?.(REQUEST_TIMEOUT_MS)
    });
    let message = '';
    if (res.status === 403) {
      try { const j = (await res.json()) as { message?: unknown }; if (typeof j?.message === 'string') message = j.message; } catch { /* no body */ }
    }
    return { res, verdict: classifyResponse(res.status, res.headers, message) };
  }

  /** Acts on a verdict that is not `ok`; true when the tick must end. */
  function handle(verdict: Verdict, status: number, retryAfter: string | null, row: LedgerRow): boolean {
    if (verdict === 'drop') {
      deps.reporter.markDropped(row, String(status));
      deps.log({ kind: 'failure-report-dropped', status, fingerprint: row.fingerprint });
      return false;
    }
    if (verdict === 'stop' || verdict === 'gone') {
      stopped = true;
      deps.log({ kind: 'failure-report-stopped', status, version: deps.appVersion });
      return true;
    }
    if (verdict === 'wait') {
      const s = Number(retryAfter);
      waitUntil = deps.now() + (Number.isFinite(s) && s > 0 ? s * 1000 : WAIT_DEFAULT_MS);
      deps.log({ kind: 'failure-report-waiting', status, until: waitUntil });
      return true;
    }
    // A server error: back off, doubling, at most an hour.
    retries++;
    waitUntil = deps.now() + Math.min(10 * 60_000 * 2 ** (retries - 1), WAIT_DEFAULT_MS);
    return true;
  }

  async function sendRow(row: LedgerRow): Promise<'next' | 'end'> {
    let issue = deps.reporter.issueFor(row.fingerprint);
    if (issue === undefined) {
      if (!canSearch()) return 'end';
      searches.push(deps.now());
      const q = encodeURIComponent(`${row.fingerprint} in:title repo:${REPORTS_REPO} type:issue -label:rejected`);
      const { res, verdict } = await call('GET', `/search/issues?q=${q}&sort=created&order=asc&per_page=5`);
      // Search answers 422 when the reports repo cannot be seen: the key's
      // problem, not this row's, so stop instead of dropping every row.
      const v = verdict === 'drop' && res.status === 422 ? 'stop' : verdict;
      if (v !== 'ok') return handle(v, res.status, res.headers.get('retry-after'), row) ? 'end' : 'next';
      const found = (await res.json()) as { items?: Array<{ number?: unknown; title?: unknown; body?: unknown }> };
      // Only a real report for this fingerprint counts, the oldest first: a
      // decoy with the fingerprint in its title, junk in its body, or fields
      // that do not hash to it would hide every later sighting from the Action.
      const hit = found.items?.find((i) => typeof i.number === 'number' && typeof i.title === 'string' && i.title.endsWith(`(${row.fingerprint})`)
        && typeof i.body === 'string' && fingerprintHolds(parseIssueBody(i.body), row.fingerprint));
      if (hit) issue = hit.number as number;
    }
    if (!canWrite()) return 'end';
    writes.push(deps.now());
    if (issue === undefined) {
      const { res, verdict } = await call('POST', `/repos/${REPORTS_REPO}/issues`, { title: issueTitle(row), body: issueBody(row), labels: ['auto'] });
      if (verdict !== 'ok') return handle(verdict, res.status, res.headers.get('retry-after'), row) ? 'end' : 'next';
      const made = (await res.json()) as { number?: unknown };
      if (typeof made.number === 'number') deps.reporter.markSent(row, made.number);
      return 'next';
    }
    const { res, verdict } = await call('POST', `/repos/${REPORTS_REPO}/issues/${issue}/comments`, { body: seenOnLine(row) });
    // A deleted issue (404 or 410): forget it and search again next time; never stop for it (OV10).
    if (verdict === 'gone') { deps.reporter.forgetIssue(row.fingerprint); return 'next'; }
    if (verdict !== 'ok') return handle(verdict, res.status, res.headers.get('retry-after'), row) ? 'end' : 'next';
    deps.reporter.markSent(row, issue);
    return 'next';
  }

  return {
    async tick(): Promise<void> {
      if (!deps.key || running || stopped || deps.now() < waitUntil) return;
      running = true;
      try {
        for (const row of deps.reporter.pending()) {
          if ((await sendRow(row)) === 'end') break;
          retries = 0;
        }
      } catch {
        // Offline or a timeout: every row stays pending for the next tick.
      } finally {
        running = false;
        deps.reporter.flush();
      }
    },
    /** For tests and the log. */
    state: () => ({ stopped, waitUntil })
  };
}
