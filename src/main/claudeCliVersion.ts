/**
 * The installed Claude Code version, for the model floor in
 * src/shared/modelCliFloor.ts.
 *
 * `claude --version` is a process launch, so the answer is cached per binary.
 * The key is the resolved real path plus its mtime: the native installer
 * updates by pointing ~/.local/bin/claude at a new versions/<n> file, and npm
 * rewrites the file in place, so either kind of update is noticed on the next
 * spawn without a restart. A probe that fails or times out answers null
 * ("unknown"), which never blocks a spawn.
 *
 * `claude --help` is probed the same way for the options this CLI takes: an
 * option the app adds for its own convenience is passed only when listed, so
 * a Claude Code that does not know it still starts (owner, 2026-10-30: an
 * unknown option ended Michael before he began).
 */
import { execFile } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { parseCliFlags, parseCliVersion } from '../shared/modelCliFloor';

const cache = new Map<string, string | null>();
const flagCache = new Map<string, Set<string>>();
/** The last version a probe answered, from any binary. */
let lastKnown: string | null = null;

/** The installed Claude Code version as last probed, or null before any probe
 *  answered. Synchronous, for a failure report written inside a crash handler. */
export function lastClaudeCliVersion(): string | null {
  return lastKnown;
}

/** How a probe runs `claude <option>`. An npm install on Windows is a .cmd
 *  shim, which Node refuses to start without cmd.exe (EINVAL), so it goes
 *  through cmd.exe, quoted for `/s`, the way claudeAuthStatusCommand does. */
export function versionCommand(platform: string, binPath: string, comSpec?: string, option = '--version'): { file: string; args: string[]; verbatim: boolean } {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(binPath)) {
    return { file: comSpec || 'cmd.exe', args: ['/d', '/s', '/c', `""${binPath}" ${option}"`], verbatim: true };
  }
  return { file: binPath, args: [option], verbatim: false };
}

/** The resolved binary and its mtime: a new install is a new key. */
function binKey(binPath: string): string | null {
  try {
    const real = realpathSync(binPath);
    return `${real}:${statSync(real).mtimeMs}`;
  } catch { return null; }
}

/** Run the CLI with one option; its output, or null when it fails to answer. */
function probe(binPath: string, option: string): Promise<string | null> {
  const cmd = versionCommand(process.platform, binPath, process.env.ComSpec, option);
  return new Promise<string | null>((resolve) => {
    // execFile throws, instead of calling back, when it cannot start the file
    // at all. That is "unknown" too, never a rejection into the spawn.
    try {
      execFile(cmd.file, cmd.args, { timeout: 5000, encoding: 'utf8', windowsVerbatimArguments: cmd.verbatim, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        resolve(err ? null : String(stdout));
      });
    } catch { resolve(null); }
  });
}

/** The long options the installed Claude Code lists in `--help`, or null when
 *  that is unknown (the caller then leaves its optional flag out). */
export async function claudeCliFlags(binPath: string | null): Promise<Set<string> | null> {
  if (!binPath) return null;
  const key = binKey(binPath);
  if (!key) return null;
  const known = flagCache.get(key);
  if (known) return known;
  const out = await probe(binPath, '--help');
  const flags = out ? parseCliFlags(out) : null;
  // Only a real list is cached: a timeout on a busy machine is worth retrying.
  if (flags && flags.size) { flagCache.set(key, flags); return flags; }
  return null;
}

export async function claudeCliVersion(binPath: string | null): Promise<string | null> {
  if (!binPath) return null;
  const key = binKey(binPath);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key)!;
  const out = await probe(binPath, '--version');
  const version = out ? parseCliVersion(out) : null;
  // Only a real answer is cached: a timeout on a busy machine is worth retrying.
  if (version) { cache.set(key, version); lastKnown = version; }
  // Starts run side by side: a probe that timed out takes the answer another
  // start got for this same install, never one from a different install.
  return version ?? cache.get(key) ?? null;
}
