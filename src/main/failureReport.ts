/**
 * Automatic failure reports, main side: notices failures, describes them with
 * closed fields only, folds repeats, and keeps them in a small local file
 * (userData/failures.jsonl) that is also the send queue
 * (docs/designs/auto-report-failures.md, E3).
 *
 *   office log event ─> observe ─┐
 *   direct point ─> reportFailure ┤─> classify ─> scrub ─> fold (fingerprint + version)
 *   renderer IPC ─> reportRenderer┘                          │ flush ≤ 30 s, and at quit
 *                                                            v
 *                                                  failures.jsonl ─> sender
 *
 * Nothing here may ever throw out or report itself: it runs inside
 * uncaughtException. A write that fails keeps at most 50 rows in memory.
 */
import {
  agoBucket, classifyLogEvent, cleanContext, cleanOsVersion, errorCodeDetail, errorName, fingerprintInput, scrubFrames,
  validateReport, ERROR_NAME_RE, OWNER_ERROR_CODES, HIDDEN_CALL_KINDS, KIND_CLASS, type FailureKind, type FailureReport
} from '../shared/failureReport';

export const LEDGER_MAX_BYTES = 1024 * 1024;
export const FLUSH_MS = 30_000;
export const PENDING_MAX_AGE_MS = 30 * 24 * 3600_000;
export const MEMORY_ROWS_ON_WRITE_FAILURE = 50;
const RECENT_MS = 7 * 24 * 3600_000;

export type RowState = 'pending' | 'sent' | 'local' | 'dropped';

/** One fingerprint in one app version. A repeat raises `count`. */
export interface LedgerRow extends FailureReport {
  ts: number;
  lastTs: number;
  state: RowState;
  /** The issue number in the reports repo, once filed or found. */
  issue?: number;
  sentAt?: number;
  /** Why a row was dropped (an HTTP status, or `age`). */
  why?: string;
}

export interface FailureReporterDeps {
  enabled: boolean;
  ledgerPath: string;
  appVersion: string;
  platform: string;
  osVersion: string;
  arch: string;
  now: () => number;
  sha256: (s: string) => string;
  /** The engine a failure ran on: the member's, else Michael's. */
  engineFor: (agentId?: string) => string;
  /** That engine's installed version when the app knows it, else null. */
  engineVersionFor?: (agentId?: string) => string | null;
  /** Which kind of member a failure was about: Michael, Research or another. */
  roleFor?: (agentId: string) => 'michael' | 'member' | 'research';
  /** How long the app has been running. */
  uptimeMs?: () => number;
  officeBreakActive: () => boolean;
  doNotTrack: () => boolean;
  /** True while sending must wait (DO_NOT_TRACK not yet read from the shell). */
  holdSending?: () => boolean;
  signalName: (n: number) => string | undefined;
  readFile: (p: string) => string | null;
  writeFile: (p: string, data: string) => void;
  warn: (what: string, e?: unknown) => void;
}

export function createFailureReporter(deps: FailureReporterDeps) {
  const rows = new Map<string, LedgerRow>();
  const memo = new Map<string, { frames: string[]; name: string }>();
  let dirty = false;
  /** Only counts changed (a repeat): written at quit or with the next real
   *  change, so a failure that keeps repeating does not rewrite the file
   *  every 30 s. The sender reads counts from memory. */
  let countsDirty = false;
  let busy = false;
  let writeFailed = false;
  let loaded = false;
  let lastReadFailure = 0;
  const key = (fp: string, version: string) => `${fp}@${version}`;
  const os = (['darwin', 'win32', 'linux'].includes(deps.platform) ? deps.platform : 'linux') as FailureReport['os'];
  const arch = (deps.arch === 'arm64' ? 'arm64' : 'x64') as FailureReport['arch'];

  /** Reads the file once. A read that fails (busy, no access) leaves it unread,
   *  and nothing is written until a read works, so saved rows are never lost. */
  function load(): void {
    if (loaded) return;
    // Retried at most once a flush interval, never on every failure noticed.
    if (lastReadFailure > 0 && deps.now() - lastReadFailure < FLUSH_MS) return;
    let text: string | null;
    try { text = deps.readFile(deps.ledgerPath); } catch (e) {
      // Never given up on: new rows wait in memory (at most 50) until it reads.
      deps.warn('read', e);
      lastReadFailure = deps.now();
      return;
    }
    loaded = true;
    if (!text) return;
    const now = deps.now();
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let r: LedgerRow;
      // A partial last line after a crash is skipped.
      try { r = JSON.parse(line) as LedgerRow; } catch { continue; }
      const { ts, lastTs, state, issue, sentAt, why, ...facts } = r;
      if (validateReport(facts) !== null || typeof ts !== 'number') continue;
      const row: LedgerRow = { ...facts, ts, lastTs: typeof lastTs === 'number' ? lastTs : ts, state, issue, sentAt, why };
      if (row.state === 'pending' && now - row.ts > PENDING_MAX_AGE_MS) { row.state = 'dropped'; row.why = 'age'; dirty = true; }
      const k = key(row.fingerprint, row.appVersion);
      // Seen while the file could not be read: the saved row wins, counts add up.
      const mem = rows.get(k);
      if (mem) {
        row.count = Math.min(row.count + mem.count, 1_000_000);
        row.lastTs = Math.max(row.lastTs, mem.lastTs);
        dirty = true;
      }
      rows.set(k, row);
    }
  }

  /** The context every kind may carry, then the caller's own, all checked. */
  function contextFor(kind: FailureKind, agentId: string | undefined, given: Record<string, string> | undefined): Record<string, string> {
    const base: Record<string, string> = {};
    try {
      if (agentId && deps.roleFor) base.role = deps.roleFor(agentId);
      if (deps.uptimeMs) base.uptime = agoBucket(deps.uptimeMs());
    } catch { /* context is a help, never a reason to lose the report */ }
    return cleanContext(kind, { ...base, ...(given ?? {}) });
  }

  /** The engine's version as a report field: digits and dots, else unknown. */
  function engineVersion(agentId?: string): string {
    try {
      const v = deps.engineVersionFor?.(agentId);
      return typeof v === 'string' && /^\d+(\.\d+){0,3}$/.test(v) ? v : 'unknown';
    } catch { return 'unknown'; }
  }

  function record(kind: FailureKind, detail: string, name: string, frames: string[], agentId?: string, given?: Record<string, string>): void {
    if (!deps.enabled || KIND_CLASS[kind] !== 'repo') return;
    load();
    const fingerprint = deps.sha256(fingerprintInput(kind, detail, name, frames)).slice(0, 12);
    const k = key(fingerprint, deps.appVersion);
    const now = deps.now();
    const had = rows.get(k);
    if (had) {
      had.count = Math.min(had.count + 1, 1_000_000);
      had.lastTs = now;
      countsDirty = true;
      return;
    }
    const context = contextFor(kind, agentId, given);
    const facts: FailureReport = {
      kind, detail, errorName: name, frames, fingerprint, appVersion: deps.appVersion, os,
      osVersion: cleanOsVersion(deps.osVersion), arch, engine: deps.engineFor(agentId), engineVersion: engineVersion(agentId), count: 1,
      ...(Object.keys(context).length ? { context } : {})
    };
    if (validateReport(facts) !== null) { deps.warn('invalid', validateReport(facts)); return; }
    rows.set(k, { ...facts, ts: now, lastTs: now, state: deps.doNotTrack() ? 'local' : 'pending' });
    dirty = true;
    if (writeFailed || !loaded) trimToMemoryCap();
  }

  function trimToMemoryCap(): void {
    if (rows.size <= MEMORY_ROWS_ON_WRITE_FAILURE) return;
    const keep = [...rows.entries()].sort((a, b) => b[1].lastTs - a[1].lastTs).slice(0, MEMORY_ROWS_ON_WRITE_FAILURE);
    rows.clear();
    for (const [k, r] of keep) rows.set(k, r);
  }

  /** Frames and name for a thrown value, scrubbed once per distinct stack. */
  function describe(err: unknown): { frames: string[]; name: string } {
    const stack = err && typeof err === 'object' && typeof (err as { stack?: unknown }).stack === 'string' ? (err as { stack: string }).stack : '';
    const memoKey = `${errorName(err)}\n${stack}`;
    const hit = memo.get(memoKey);
    if (hit) return hit;
    const d = { frames: scrubFrames(stack), name: errorName(err) };
    if (memo.size > 200) memo.clear();
    memo.set(memoKey, d);
    return d;
  }

  function guarded(fn: () => void): void {
    if (busy) return;
    busy = true;
    try { fn(); } catch (e) { try { deps.warn('report', e); } catch { /* nothing left to do */ } } finally { busy = false; }
  }

  function serialize(list: LedgerRow[]): string {
    return list.map((r) => JSON.stringify(r)).join('\n') + (list.length ? '\n' : '');
  }

  /** Writes the file when something changed; `final` (at quit) also writes
   *  count-only changes. */
  function flush(final = false): void {
    if (!dirty && !(final && countsDirty)) return;
    guarded(() => {
      load();
      if (!loaded) return;
      let list = [...rows.values()];
      let text = serialize(list);
      if (text.length > LEDGER_MAX_BYTES) {
        // Keep one old file; carry what is still owed or still names an issue.
        try { deps.writeFile(`${deps.ledgerPath.replace(/\.jsonl$/, '')}.1.jsonl`, text); } catch (e) { deps.warn('rotate', e); }
        list = list.filter((r) => r.state === 'pending' || typeof r.issue === 'number');
        rows.clear();
        for (const r of list) rows.set(key(r.fingerprint, r.appVersion), r);
        text = serialize(list);
      }
      try {
        deps.writeFile(deps.ledgerPath, text);
        dirty = false;
        countsDirty = false;
        writeFailed = false;
      } catch (e) {
        writeFailed = true;
        trimToMemoryCap();
        deps.warn('write', e);
      }
    });
  }

  return {
    /** Every office log event, from hive.logObserver. */
    observe(e: Record<string, unknown>): void {
      guarded(() => {
        const kind = typeof e.kind === 'string' ? e.kind : '';
        // An office break (credit, sign in, limit) explains exits and failed
        // background checks: the owner's to fix, never reported.
        if ((kind === 'agent-exit' || kind === 'trust-check-failed' || (HIDDEN_CALL_KINDS as readonly string[]).includes(kind)) && deps.officeBreakActive()) return;
        const c = classifyLogEvent(e, deps.signalName);
        if (!c) return;
        record(c.kind, c.detail, 'Error', [], typeof e.agentId === 'string' ? e.agentId : undefined);
      });
    },

    /** A failure caught in main: a crash handler, the router, a hook, a spawn. */
    reportFailure(kind: FailureKind, err?: unknown, opts: { detail?: string; agentId?: string; context?: Record<string, string> } = {}): void {
      guarded(() => {
        const { frames, name } = describe(err);
        const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
        // A full disk is the owner's to fix, never a report (D11).
        if (typeof code === 'string' && OWNER_ERROR_CODES.includes(code)) return;
        record(kind, opts.detail ?? errorCodeDetail(code), name, frames, opts.agentId, opts.context);
      });
    },

    /** A screen crash or renderer error, sent over IPC. Main scrubs and checks
     *  it again: nothing the renderer says is trusted. */
    reportRenderer(payload: unknown): void {
      guarded(() => {
        if (!payload || typeof payload !== 'object') return;
        const p = payload as Record<string, unknown>;
        if (p.kind !== 'screen-crash' && p.kind !== 'renderer-error') return;
        const stack = typeof p.stack === 'string' ? p.stack.slice(0, 8192) : '';
        const name = typeof p.name === 'string' && ERROR_NAME_RE.test(p.name) ? p.name : 'Error';
        const frames = scrubFrames(stack);
        // No app frame (a ResizeObserver notice, a cross origin "Script error.")
        // gives nobody anything to fix, and would be one report from every office.
        if (!frames.length) return;
        record(p.kind, 'none', name, frames);
      });
    },

    flush,

    /** Rows the sender should file, oldest first. None while DO_NOT_TRACK is
     *  set, including rows kept before it was (SR4: nothing is sent). */
    pending(): LedgerRow[] {
      load();
      // Nothing goes before the file is read: a row sent now could be sent
      // again once the saved copy of it loads.
      if (!loaded || deps.doNotTrack() || deps.holdSending?.()) return [];
      return [...rows.values()].filter((r) => r.state === 'pending').sort((a, b) => a.ts - b.ts);
    },

    /** The issue a fingerprint already has, in any version. */
    issueFor(fingerprint: string): number | undefined {
      load();
      if (!loaded) return undefined;
      for (const r of rows.values()) if (r.fingerprint === fingerprint && typeof r.issue === 'number') return r.issue;
      return undefined;
    },

    markSent(row: LedgerRow, issue: number): void {
      const r = rows.get(key(row.fingerprint, row.appVersion));
      if (!r) return;
      r.state = 'sent';
      r.issue = issue;
      r.sentAt = deps.now();
      dirty = true;
    },

    /** The issue was deleted: forget it for every row of this fingerprint. */
    forgetIssue(fingerprint: string): void {
      for (const r of rows.values()) if (r.fingerprint === fingerprint) delete r.issue;
      dirty = true;
    },

    markDropped(row: LedgerRow, why: string): void {
      const r = rows.get(key(row.fingerprint, row.appVersion));
      if (!r) return;
      r.state = 'dropped';
      r.why = why;
      dirty = true;
    },

    /** At most 5 fingerprints sent in the last 7 days, newest first (E7). */
    recentFingerprints(): string[] {
      try {
        load();
        const since = deps.now() - RECENT_MS;
        const seen = new Set<string>();
        for (const r of [...rows.values()].sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))) {
          if (r.state === 'sent' && (r.sentAt ?? 0) >= since) seen.add(r.fingerprint);
          if (seen.size === 5) break;
        }
        return [...seen];
      } catch { return []; }
    }
  };
}

export type FailureReporter = ReturnType<typeof createFailureReporter>;
