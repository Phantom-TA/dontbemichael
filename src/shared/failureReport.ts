/**
 * Automatic failure reports: what is reported, how it is described, and how an
 * issue is written and read back (docs/designs/auto-report-failures.md).
 *
 * Only failures the repo owners can fix in code are reported (owner, D11);
 * anything the owner or an agent can fix (sign in, credit, a wrong route) is
 * never filed. A report holds closed fields only: no message text, no log
 * line, no name, no path outside the app's own bundle.
 *
 * This file imports nothing on purpose: the reports repo's promotion Action
 * fetches it by release tag and runs it on its own (eng review OV5).
 */

/** The private repo the app files into. The shipped key reaches only this
 *  repo, and the sender refuses any other target (SR2). */
export const REPORTS_REPO = 'dontbemichael-reports/failures';

export const FAILURE_KINDS = [
  'main-uncaught', 'main-rejection', 'screen-crash', 'renderer-error', 'agent-exit',
  'router-throw', 'loop-messages', 'loop-agent', 'outbox-bad', 'research-inbox',
  'canary', 'proxy-degraded', 'owner-outbox-unrouted', 'hook-server', 'cmd-fallback',
  'bridge-install', 'hidden-call-failed', 'trust-check-failed'
] as const;
export type FailureKind = (typeof FAILURE_KINDS)[number];

/** `repo` is reported; `owner` is for the owner or an agent to fix and is
 *  never reported; `none` is not a failure. */
export type FailureClass = 'repo' | 'owner' | 'none';

/** The canary proves the pipeline works after a release; it is never promoted. */
export const KIND_CLASS: Readonly<Record<FailureKind, FailureClass>> = Object.fromEntries(
  FAILURE_KINDS.map((k) => [k, k === 'canary' ? 'none' : 'repo'])
) as Record<FailureKind, FailureClass>;

/** The engines a report can name. Kept here rather than imported from
 *  agentProvider.ts so this file stays standalone; a test fails when the two
 *  lists differ. */
export const ENGINES = [
  'claude', 'codex', 'grok', 'kimi', 'gemini', 'antigravity', 'qwen',
  'opencode', 'crush', 'pi', 'copilot', 'cursor', 'custom'
] as const;

/** The background check callers. Each logs the check's error verbatim as
 *  `reason`, so the class comes from that text (eng E-R1). */
export const HIDDEN_CALL_KINDS = [
  'hire-check-fallback', 'work-style-fallback', 'work-style-revise-failed', 'focus-check-skipped',
  'standing-check-unread', 'foundation-file-check-unread', 'run-compare-failed'
] as const;

/** Every literal error a background check can end with, and its code side
 *  class, or null when it cannot tell a bug from sign in, credit or a slow
 *  network (never reported). Dynamic or unknown text is never reported. */
export const HIDDEN_ERRORS: Readonly<Record<string, string | null>> = {
  'could not submit background check': 'submit-failed',
  'could not prepare background check': 'prepare-failed',
  'background answer too large': 'answer-too-large',
  'empty prompt': 'empty-prompt',
  // The callers' own words for an answer that came back but did not parse.
  'unreadable': 'answer-unparseable',
  'empty': 'answer-unparseable',
  'no verdict': 'answer-unparseable',
  'engine unavailable': null,
  'cancelled': null,
  'hidden session timed out': null,
  'background check failed': null,
  'no assistant response': null,
  'no assistant response found in transcript': null,
  'hidden session never took the prompt (signed out, or a screen is waiting)': null,
  'picture path has control characters': null,
  'request unreadable (no name or no change)': null,
  'failed': null
};

/** The classes above that are bugs in the app, not sign in, credit or network. */
const CODE_SIDE: readonly string[] = [...new Set(Object.values(HIDDEN_ERRORS).filter((c): c is string => c !== null))];

export function hiddenErrorClass(reason: unknown): string | null {
  if (typeof reason !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(HIDDEN_ERRORS, reason) ? HIDDEN_ERRORS[reason] : null;
}

/** Every drop reason the router logs, with its class. */
export const DROP_REASON_CLASS: Readonly<Record<string, FailureClass>> = {
  'hop-cap': 'repo',
  'malformed-json': 'repo',
  'outbox-not-a-file': 'repo',
  'owner-outbox-not-routed': 'repo',
  'unstamped-research-inbox': 'repo',
  'research-unchecked': 'repo',
  // Bounced so the agent or Michael fixes the route.
  'no-inbox': 'owner',
  'reply-to-system-sender': 'owner',
  // The owner's Research setting, by design.
  'research-off': 'owner',
  'research-held': 'owner'
};

/** Every kind the office log writes, with its class. A kind written anywhere
 *  in src/main and missing here fails a test, so a new failure cannot slip in
 *  unclassed. `drop` and the background check kinds are classed per event. */
export const LOG_KIND_CLASS: Readonly<Record<string, FailureClass>> = {
  'agent-exit': 'repo', 'drop': 'repo', 'proxy-degraded': 'repo', 'hook-server-error': 'repo',
  'trust-check-failed': 'repo',
  ...Object.fromEntries(HIDDEN_CALL_KINDS.map((k) => [k, 'repo'])),
  // The office break is the owner's account (credit, sign in, limit).
  'office-break': 'owner',
  // A frame without its secret is refused by design.
  'hook-frame-rejected': 'none',
  'agent-hold': 'none', 'app-start': 'none', 'archive': 'none', 'card-reopen': 'none', 'clear': 'none',
  'clear-cancelled': 'none', 'clear-handoff-asked': 'none', 'closed-by-owner': 'none', 'compact': 'none',
  'distinct-check': 'none', 'drain': 'none', 'foundations': 'none', 'member-deleted': 'none',
  'memory-read': 'none', 'memory-reset': 'none', 'memory-reset-start': 'none', 'memory-tidy': 'none',
  'memory-tidy-abort': 'none', 'message': 'none', 'message-held-for-trust-layer': 'none',
  'message-held-not-reporting': 'none', 'outbox-repair': 'none', 'owner-reply-unmatched': 'none',
  'owner-request-closed': 'none', 'rename': 'none', 'reroute': 'none', 'research-reply-flagged': 'none',
  'role': 'none', 'run-compare-held': 'none', 'schedule-request': 'none', 'session': 'none',
  'session-restored': 'none', 'silent-auto-restart': 'none', 'spawn': 'none', 'tasks': 'none',
  'terminal-handoff': 'none', 'trust-checked': 'none', 'trust-denied': 'none', 'trust-held': 'none',
  'trust-layer': 'none', 'trust-retry': 'none', 'trust-wait': 'none', 'upkeep-to-research': 'none',
  'work-style-handoff-written': 'none',
  // The failure sender's own state changes.
  'failure-report-stopped': 'none', 'failure-report-waiting': 'none', 'failure-report-dropped': 'none'
};

const ERROR_CODE = /^([A-Z][A-Z0-9_]{1,23}|none)$/;
const DETAIL: Readonly<Record<FailureKind, (d: string) => boolean>> = {
  'main-uncaught': (d) => ERROR_CODE.test(d),
  'main-rejection': (d) => ERROR_CODE.test(d),
  'screen-crash': (d) => ERROR_CODE.test(d),
  'renderer-error': (d) => ERROR_CODE.test(d),
  'router-throw': (d) => ERROR_CODE.test(d),
  'bridge-install': (d) => ERROR_CODE.test(d),
  'hook-server': (d) => ERROR_CODE.test(d),
  'agent-exit': (d) => /^(SIG[A-Z0-9]{2,8}|code-([1-9]\d?|1\d\d|2[0-4]\d|25[0-5])|other)$/.test(d),
  'loop-messages': (d) => d === 'hop-cap',
  'loop-agent': (d) => /^(repeat|error-storm|velocity|no-progress):(constrained|stopped)$/.test(d),
  'outbox-bad': (d) => d === 'malformed-json' || d === 'outbox-not-a-file',
  'owner-outbox-unrouted': (d) => d === 'owner-outbox-not-routed',
  'research-inbox': (d) => d === 'unstamped-research-inbox' || d === 'research-unchecked',
  'proxy-degraded': (d) => d === 'proxy-bind',
  'cmd-fallback': (d) => d === 'multiline',
  'canary': (d) => d === 'release',
  'hidden-call-failed': (d) => {
    const [kind, cls] = d.split(':');
    return (HIDDEN_CALL_KINDS as readonly string[]).includes(kind) && CODE_SIDE.includes(cls);
  },
  'trust-check-failed': (d) => {
    const [kind, cls] = d.split(':');
    return kind === 'trust-check-failed' && CODE_SIDE.includes(cls);
  }
};

/** A Node error code as a detail, or `none`. */
export function errorCodeDetail(code: unknown): string {
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : 'none';
}

/** What an office log event reports, if anything. `signalName` turns a
 *  node-pty signal number into its name (main passes os.constants.signals). */
export function classifyLogEvent(
  e: Record<string, unknown>,
  signalName: (n: number) => string | undefined = () => undefined
): { kind: FailureKind; detail: string } | null {
  const kind = typeof e.kind === 'string' ? e.kind : '';
  if (kind === 'drop') {
    const reason = typeof e.reason === 'string' ? e.reason : '';
    if (DROP_REASON_CLASS[reason] !== 'repo') return null;
    if (reason === 'hop-cap') return { kind: 'loop-messages', detail: reason };
    if (reason === 'malformed-json' || reason === 'outbox-not-a-file') return { kind: 'outbox-bad', detail: reason };
    if (reason === 'owner-outbox-not-routed') return { kind: 'owner-outbox-unrouted', detail: reason };
    return { kind: 'research-inbox', detail: reason };
  }
  if (kind === 'agent-exit') {
    const sig = typeof e.signal === 'number' && e.signal !== 0 ? signalName(e.signal) : undefined;
    const code = typeof e.exitCode === 'number' ? e.exitCode : null;
    const detail = sig && /^SIG[A-Z0-9]{2,8}$/.test(sig) ? sig
      : code !== null && Number.isInteger(code) && code >= 1 && code <= 255 ? `code-${code}`
      : 'other';
    return { kind: 'agent-exit', detail };
  }
  if (kind === 'proxy-degraded') return { kind: 'proxy-degraded', detail: 'proxy-bind' };
  if (kind === 'hook-server-error') return { kind: 'hook-server', detail: errorCodeDetail(e.code) };
  if ((HIDDEN_CALL_KINDS as readonly string[]).includes(kind) || kind === 'trust-check-failed') {
    // trust-check-failed logs `error`, the callers log `reason` (eng OV3).
    const cls = hiddenErrorClass(e.reason ?? e.error);
    if (!cls) return null;
    return { kind: kind === 'trust-check-failed' ? 'trust-check-failed' : 'hidden-call-failed', detail: `${kind}:${cls}` };
  }
  return null;
}

/** The breaker arm a trip reason names, for `loop-agent`; null for the
 *  owner's own caps (token limit, cost cap, token cap), which are not bugs.
 *  The reason words are breaker.ts's (plainBreakerReason reads the same). */
export function breakerArm(reason: unknown): 'repeat' | 'error-storm' | 'velocity' | 'no-progress' | null {
  if (typeof reason !== 'string') return null;
  if (reason.startsWith('looping:')) return 'repeat';
  if (reason.startsWith('error storm:')) return 'error-storm';
  if (reason.startsWith('token velocity')) return 'velocity';
  if (reason.startsWith('no-progress:')) return 'no-progress';
  return null;
}

/** The `loop-agent` detail for one breaker decision, or null: a steer is
 *  only a nudge, and the owner's own caps are not bugs. */
export function loopAgentDetail(action: string, reason: unknown): string | null {
  const arm = breakerArm(reason);
  if (!arm || (action !== 'constrain' && action !== 'stop')) return null;
  return `${arm}:${action === 'stop' ? 'stopped' : 'constrained'}`;
}

/* ── Stack frames ─────────────────────────────────────────────────────────── */

export const MAX_FRAMES = 8;
export const FRAME_RE = /^(out\/(main|preload)\/[\w.-]+\.js|out\/renderer\/assets\/[\w.-]+\.js):([A-Za-z_$][\w$.<>]{0,60}|-):\d+$/;

/** The app's own frames from a V8 stack, as `out/main/index.js:fn:line`.
 *  Only paths inside the bundle survive, so a home folder or a user name can
 *  never reach a report: anything else is dropped, not cleaned. */
export function scrubFrames(stack: unknown): string[] {
  if (typeof stack !== 'string') return [];
  const out: string[] = [];
  for (const raw of stack.split('\n')) {
    const m = raw.match(/^\s*at (?:(.+?) \()?(.+?):(\d+):\d+\)?\s*$/);
    if (!m) continue;
    const path = m[2].replace(/\\/g, '/').replace(/^file:\/\/\/?/, '/');
    const at = path.lastIndexOf('/out/');
    if (at === -1) continue;
    let file = path.slice(at + 1);
    const renderer = file.startsWith('out/renderer/assets/');
    if (renderer) file = file.replace(/-[A-Za-z0-9_-]{8}(\.js)$/, '$1');
    let fn = (m[1] ?? '').replace(/^(async|new) /, '').trim();
    if (renderer || !/^[A-Za-z_$][\w$.<>]{0,60}$/.test(fn)) fn = '-';
    const frame = `${file}:${fn}:${m[3]}`;
    if (FRAME_RE.test(frame)) out.push(frame);
    if (out.length === MAX_FRAMES) break;
  }
  return out;
}

/** A name shaped like an error class (`TypeError`, `AbortError`). Anything
 *  else could be a record's own name field and never reaches an issue title. */
export const ERROR_NAME_RE = /^(Error|[A-Z][A-Za-z]{0,30}(Error|Exception))$/;

/** The error class name of a real Error, or `Error`. */
export function errorName(err: unknown): string {
  const n = err instanceof Error ? err.name : undefined;
  return typeof n === 'string' && ERROR_NAME_RE.test(n) ? n : 'Error';
}

/** A release version, with the prerelease forms the release workflow publishes. */
export const VERSION_RE = /^\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/;

/** What the fingerprint hashes: no version and no line numbers, so a failure
 *  groups across releases and small edits. Main hashes it with sha256. */
export function fingerprintInput(kind: string, detail: string, name: string, frames: readonly string[]): string {
  return [kind, detail, name, ...frames.map((f) => f.replace(/:\d+$/, ''))].join('\n');
}

/* ── The report ───────────────────────────────────────────────────────────── */

export interface FailureReport {
  kind: FailureKind;
  detail: string;
  errorName: string;
  frames: string[];
  fingerprint: string;
  appVersion: string;
  os: 'darwin' | 'win32' | 'linux';
  osVersion: string;
  arch: 'x64' | 'arm64';
  engine: string;
  engineVersion: string;
  count: number;
}

const FIELDS: ReadonlyArray<keyof FailureReport> = [
  'kind', 'detail', 'errorName', 'fingerprint', 'appVersion', 'os', 'osVersion', 'arch', 'engine', 'engineVersion', 'count'
];

/** The OS version as digits and dots only (a Linux kernel string keeps its
 *  leading numbers), or `0`. */
export function cleanOsVersion(v: unknown): string {
  const m = typeof v === 'string' ? v.match(/^\d+(\.\d+){0,3}/) : null;
  return m ? m[0] : '0';
}

/** Why a report is not well formed, or null. One validator for the app and
 *  the Action. */
export function validateReport(r: unknown): string | null {
  if (!r || typeof r !== 'object') return 'not an object';
  const x = r as Record<string, unknown>;
  for (const k of Object.keys(x)) if (![...FIELDS, 'frames'].includes(k as keyof FailureReport)) return `unknown field ${k}`;
  if (!(FAILURE_KINDS as readonly string[]).includes(x.kind as string)) return 'kind';
  if (typeof x.detail !== 'string' || !DETAIL[x.kind as FailureKind](x.detail)) return 'detail';
  if (typeof x.errorName !== 'string' || !ERROR_NAME_RE.test(x.errorName)) return 'errorName';
  if (!Array.isArray(x.frames) || x.frames.length > MAX_FRAMES || !x.frames.every((f) => typeof f === 'string' && FRAME_RE.test(f))) return 'frames';
  if (typeof x.fingerprint !== 'string' || !/^[0-9a-f]{12}$/.test(x.fingerprint)) return 'fingerprint';
  if (typeof x.appVersion !== 'string' || !VERSION_RE.test(x.appVersion)) return 'appVersion';
  if (!['darwin', 'win32', 'linux'].includes(x.os as string)) return 'os';
  if (typeof x.osVersion !== 'string' || !/^\d+(\.\d+){0,3}$/.test(x.osVersion)) return 'osVersion';
  if (!['x64', 'arm64'].includes(x.arch as string)) return 'arch';
  if (!([...ENGINES, 'none'] as string[]).includes(x.engine as string)) return 'engine';
  if (typeof x.engineVersion !== 'string' || !/^(\d+(\.\d+){0,3}|unknown)$/.test(x.engineVersion)) return 'engineVersion';
  if (!Number.isInteger(x.count) || (x.count as number) < 1 || (x.count as number) > 1_000_000) return 'count';
  return null;
}

/** The issue title; the fingerprint in it is what dedupe searches for. */
export function issueTitle(r: FailureReport): string {
  return `[auto] ${r.kind} ${r.errorName} (${r.fingerprint})`;
}

/** The issue body: the fields as a fixed table and the frames in a code
 *  block, so nothing in them is linkified. Rendered by code, never copied. */
export function issueBody(r: FailureReport): string {
  const rows = FIELDS.map((k) => `| ${k} | \`${String(r[k])}\` |`);
  return [
    'Automatic failure report. Fields only, no free text (docs/designs/auto-report-failures.md).',
    '',
    '| field | value |',
    '|---|---|',
    ...rows,
    '',
    'Frames:',
    '```text',
    ...(r.frames.length ? r.frames : ['(none)']),
    '```',
    ''
  ].join('\n');
}

/** Reads a body written by issueBody; null when it is not one. */
export function parseIssueBody(body: string): FailureReport | null {
  const x: Record<string, unknown> = {};
  for (const line of body.split('\n')) {
    const m = line.match(/^\| (\w+) \| `([^`]*)` \|$/);
    if (m && (FIELDS as readonly string[]).includes(m[1])) x[m[1]] = m[1] === 'count' ? Number(m[2]) : m[2];
  }
  const block = body.match(/```text\n([\s\S]*?)\n```/);
  x.frames = block ? block[1].split('\n').filter((f) => f !== '(none)') : [];
  return validateReport(x) === null ? (x as unknown as FailureReport) : null;
}

/** The one line comment a later sighting adds to a known issue. */
export function seenOnLine(r: Pick<FailureReport, 'appVersion' | 'os' | 'osVersion' | 'arch' | 'engine' | 'engineVersion' | 'count'>): string {
  return `seen-on ${r.appVersion} ${r.os} ${r.osVersion} ${r.arch} ${r.engine} ${r.engineVersion} count=${r.count}`;
}

export interface SeenOn { appVersion: string; os: string; osVersion: string; arch: string; engine: string; engineVersion: string; count: number }

/** Reads a `seen-on` comment, checking every field; null when it is not one. */
export function parseSeenOn(text: string): SeenOn | null {
  const m = text.trim().match(/^seen-on (\S+) (\S+) (\S+) (\S+) (\S+) (\S+) count=(\d{1,7})$/);
  if (!m) return null;
  const s: SeenOn = { appVersion: m[1], os: m[2], osVersion: m[3], arch: m[4], engine: m[5], engineVersion: m[6], count: Number(m[7]) };
  const probe = { kind: 'canary', detail: 'release', errorName: 'Error', frames: [], fingerprint: '000000000000', ...s };
  return validateReport(probe) === null ? s : null;
}
