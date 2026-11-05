import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// These helpers mirror the resolution logic in pty.ts. They exist separately so
// headless child processes can launch `claude` with the same PATH the user's
// interactive shell sees — Electron on macOS starts without the login-shell PATH,
// so a bare `claude` would otherwise fail
// with ENOENT in a packaged build.

let cachedPath: string | null = null;

/** script → captured output, memoised for the process lifetime. Every capture
 *  boots a full interactive login shell (rc files and all) — hundreds of ms of
 *  BLOCKING spawnSync on the main process — and shell PATH / binary locations
 *  don't change mid-session. Only successful captures are cached, so a null
 *  (shell failed / fence missing) stays retryable. */
const shellCapture = new Map<string, string>();

/** How long one login-shell capture may block the main process. */
let captureTimeoutMs = 3000;

/** After a failed PATH capture, how long userShellPath() hands out the process
 *  PATH before it asks the shell again. Retrying on every spawn would make a
 *  shell that keeps timing out freeze the main process on every spawn. */
const PATH_RETRY_MS = 60_000;
let pathRetryAt = 0;
let now = (): number => Date.now();

/** Test seam: forget every cached capture and, optionally, shorten the capture
 *  timeout so a slow-shell test does not have to wait the full 3 s, and swap
 *  the clock that paces PATH retries. */
export function __resetShellEnvForTest(
  opts: { timeoutMs?: number; now?: () => number } = {}
): void {
  shellCapture.clear();
  cachedPath = null;
  pathRetryAt = 0;
  captureTimeoutMs = opts.timeoutMs ?? 3000;
  now = opts.now ?? (() => Date.now());
}

/** Run `script` in the user's INTERACTIVE login shell and return only what the
 *  script itself printed.
 *
 *  An interactive shell is required to pick up nvm/asdf/brew PATH edits, but it
 *  also runs the user's rc files, which are free to print. Some zsh setups emit
 *  `Restored session: <date>` from a session-save plugin BEFORE the script's
 *  own output, which silently poisons every value read back: a plain `.trim()`
 *  on `echo "$PATH"` yields `"Restored session: …\n/opt/homebrew/bin:…"` and
 *  that whole string gets handed to every agent as its PATH. Fencing the output
 *  between two markers makes rc-file chatter (before, after, or both)
 *  impossible to mistake for a result. Returns null when the shell fails or the
 *  fence never appears. */
export function captureFromLoginShell(script: string): string | null {
  const cached = shellCapture.get(script);
  if (cached !== undefined) return cached;
  const value = captureFromLoginShellUncached(script);
  if (value !== null) shellCapture.set(script, value);
  return value;
}

function captureFromLoginShellUncached(script: string): string | null {
  const mark = '__MD_SHELL_FENCE__';
  try {
    // SIGKILL, not the default SIGTERM: an INTERACTIVE zsh or bash ignores
    // SIGTERM, so a timed-out shell kept running its rc files (nvm, conda, a
    // cold network mount) and spawnSync blocked the whole main process until
    // they finished, however long past the timeout that was.
    const res = spawnSync(
      process.env.SHELL ?? '/bin/zsh',
      ['-ilc', `printf %s ${mark}; ${script}; printf %s ${mark}`],
      { encoding: 'utf8', timeout: captureTimeoutMs, killSignal: 'SIGKILL' }
    );
    const out = res.stdout ?? '';
    const start = out.indexOf(mark);
    const end = out.lastIndexOf(mark);
    if (start < 0 || end <= start) return null;
    return out.slice(start + mark.length, end);
  } catch {
    return null;
  }
}

/** The user's interactive-shell PATH, cached for the session once the shell
 *  has answered. */
export function userShellPath(): string {
  if (cachedPath !== null) return cachedPath;
  // Windows has no interactive login-shell PATH problem — use the process PATH directly.
  if (process.platform === 'win32') {
    cachedPath = process.env.PATH || '';
    return cachedPath;
  }
  // Only a real answer is cached. The process PATH is the fallback, and for a
  // Finder or Dock launch it is launchd's bare /usr/bin:/bin:/usr/sbin:/sbin;
  // caching it after one slow first launch left every agent, hidden call and
  // MCP list without node, brew or uv for the whole session. Ask again after
  // PATH_RETRY_MS instead.
  const fallback = process.env.PATH || '';
  if (now() < pathRetryAt) return fallback;
  const shellPath = captureFromLoginShell('printf %s "$PATH"')?.trim();
  // A PATH is a single colon-joined line. Anything multi-line is rc-file noise
  // that slipped the fence — fall back rather than hand the agent a corrupt
  // PATH it would carry into every subprocess it spawns.
  if (shellPath && !shellPath.includes('\n')) {
    cachedPath = shellPath;
    return cachedPath;
  }
  pathRetryAt = now() + PATH_RETRY_MS;
  return fallback;
}

let cachedDnt: boolean | null = null;

/** DO_NOT_TRACK as the user's shell sets it: a Mac app opened from the Dock
 *  never sees an export in ~/.zshrc. Kept once a read works; null when the
 *  shell could not be read, so the caller holds sending and tries again. */
export function userShellDoNotTrack(): boolean | null {
  if (cachedDnt !== null) return cachedDnt;
  if (process.platform === 'win32') return (cachedDnt = false);
  // printenv works in every shell (fish cannot parse ${VAR:-}).
  const out = captureFromLoginShell('printenv DO_NOT_TRACK');
  if (out === null) return null;
  const v = out.trim();
  cachedDnt = v !== '' && v !== '0' && !v.includes('\n');
  return cachedDnt;
}

/** Resolve a bare command (e.g. 'claude') against the user's PATH + common
 *  install locations. Returns the input unchanged if it already looks like a path. */
/** A plain executable name — the only shape we resolve against the user's PATH.
 *  A resolver may interpolate this token into a shell (`$SHELL -ilc "… which
 *  <it> …"`), so it is constrained to characters that are unambiguously part of
 *  a binary name (`[A-Za-z0-9._+-]`); anything else is not a command name and is
 *  refused rather than resolved. Callers early-return real paths (containing `/`
 *  or `\`) before this, so the only input that reaches a resolver is meant to be
 *  a bare binary name. */
export function isSafeCommandName(command: string): boolean {
  return /^[A-Za-z0-9._+-]+$/.test(command);
}

export function resolveCommand(command: string): string {
  // Already an absolute/relative path (Unix `/` or Windows `\`) — pass through.
  if (command.includes('/') || command.includes('\\')) return command;
  // Not a plain command name → nothing to resolve. Returned unchanged so the
  // caller's spawn ENOENTs it, and no shell ever sees it.
  if (!isSafeCommandName(command)) return command;
  if (process.platform === 'win32') {
    // `where` is the Windows equivalent of `which`. No `shell:true`: the command
    // is already proven metacharacter-free above, and running `where` directly
    // (libuv resolves it to where.exe via PATHEXT) keeps cmd.exe out of the loop.
    try {
      const res = spawnSync('where', [command], { encoding: 'utf8', timeout: 3000 });
      const path = (res.stdout ?? '').trim().split(/\r?\n/)[0];
      if (path && existsSync(path)) return path;
    } catch { /* fall through */ }
    const appData = process.env.APPDATA ?? '';
    const localAppData = process.env.LOCALAPPDATA ?? '';
    const home = process.env.USERPROFILE ?? process.env.HOME ?? '';
    const programFiles = process.env.ProgramFiles ?? '';
    const winCandidates = [
      `${appData}\\npm\\${command}.cmd`,
      `${appData}\\npm\\${command}`,
      `${localAppData}\\Programs\\claude\\${command}.exe`,
      // Claude's own installer (install.ps1) puts claude.exe here and updates the
      // user PATH in the registry, which this already running app never sees.
      `${home}\\.local\\bin\\${command}.exe`,
      // The app's own Node install (nodeInstall.ts) lands here, and this running
      // app's PATH predates it. Never built from an unset variable (drive root).
      ...(programFiles ? [`${programFiles}\\nodejs\\${command}.exe`, `${programFiles}\\nodejs\\${command}.cmd`] : []),
      `${home}\\.claude\\local\\${command}.cmd`,
      `${home}\\.claude\\local\\${command}`
    ];
    for (const c of winCandidates) if (existsSync(c)) return c;
    return command;
  }
  const which = captureFromLoginShell(`which ${command}`);
  if (which) {
    const path = which.trim().split('\n').map((l) => l.trim()).filter(Boolean).pop();
    if (path && existsSync(path)) return path;
  }
  const candidates = [
    `/opt/homebrew/bin/${command}`,
    `/usr/local/bin/${command}`,
    `${process.env.HOME ?? ''}/.local/bin/${command}`,
    `${process.env.HOME ?? ''}/.claude/local/${command}`,
    `${process.env.HOME ?? ''}/.volta/bin/${command}`
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  return command;
}
