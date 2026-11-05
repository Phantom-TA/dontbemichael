/**
 * The shell Claude Code runs an agent's hook and status line commands in.
 *
 * POSIX: bash. Windows: bash when Claude Code finds Git Bash, else PowerShell
 * (Claude Code 2.1.296: `e.shell ?? (gitBash ? "bash" : "powershell")`). A
 * Windows office without Git for Windows got `"<launcher>" "<cth-hook.cjs>"`,
 * which PowerShell refuses to parse ("Unexpected token"), so every hook failed
 * and the shim never reported (owner, 2026-10-09).
 *
 * Hooks name their shell, but the status line has no `shell` field and runs
 * in Claude Code's default, so the app finds Git Bash the same way Claude Code
 * does and hands the agent `CLAUDE_CODE_GIT_BASH_PATH` when it finds one: the
 * two always agree.
 */
import { existsSync } from 'node:fs';
import { win32 } from 'node:path';

export type HookShell = 'bash' | 'powershell';

const BASH_NAMES = new Set(['bash.exe', 'sh.exe', 'bash', 'sh']);
const STOCK_GIT_BASH = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'];

/** An env value by name, any case (Windows keys are case insensitive). */
function envValue(env: NodeJS.ProcessEnv, name: string): string | undefined {
  const key = Object.keys(env).find((k) => k.toUpperCase() === name);
  return key ? env[key] : undefined;
}

/**
 * Git Bash in Claude Code's order: CLAUDE_CODE_GIT_BASH_PATH when it names an
 * existing bash or sh, the stock install folders, then `git` on PATH (its
 * install's bin\bash.exe). Null when there is none.
 */
export function findGitBash(env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string | null {
  const set = envValue(env, 'CLAUDE_CODE_GIT_BASH_PATH');
  if (set && BASH_NAMES.has(win32.basename(set).toLowerCase()) && exists(set)) return set;
  for (const p of STOCK_GIT_BASH) if (exists(p)) return p;
  const exts = (envValue(env, 'PATHEXT') || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  // A PATH entry may be quoted on Windows ("C:\Program Files\Git\cmd").
  for (const dir of (envValue(env, 'PATH') ?? '').split(';').map((d) => d.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean)) {
    for (const ext of exts) {
      const git = win32.join(dir, `git${ext.toLowerCase()}`);
      if (!exists(git)) continue;
      const bash = win32.join(git, '..', '..', 'bin', 'bash.exe');
      return exists(bash) ? bash : null;
    }
  }
  return null;
}

/** The shell for an agent's hooks and status line, and the Git Bash to pin. */
export function hookShell(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): { shell: HookShell; gitBash: string | null } {
  if (platform !== 'win32') return { shell: 'bash', gitBash: null };
  // The scan stats every PATH folder, so a spawn reuses the Git Bash it found
  // while the inputs are unchanged.
  const key = [envValue(env, 'PATH'), envValue(env, 'PATHEXT'), envValue(env, 'CLAUDE_CODE_GIT_BASH_PATH')].join('\u0000');
  // Only a found Git Bash is kept, and only while it still exists: "none" is
  // looked for again on every spawn, so a Git Bash that comes back is used.
  // A pinned Git Bash comes first for Claude Code, so a pin that is not the one
  // kept is looked up again (it may have appeared since).
  const pin = envValue(env, 'CLAUDE_CODE_GIT_BASH_PATH');
  if (exists === existsSync && lastShell?.key === key && (!pin || pin === lastShell.value.gitBash) && exists(lastShell.value.gitBash)) return { shell: 'bash', gitBash: lastShell.value.gitBash };
  const gitBash = findGitBash(env, exists);
  const value = { shell: (gitBash ? 'bash' : 'powershell') as HookShell, gitBash };
  if (exists === existsSync && gitBash) lastShell = { key, value: { gitBash } };
  return value;
}
let lastShell: { key: string; value: { gitBash: string } } | undefined;

/**
 * One command line in that shell: the executable and script quoted (paths may
 * hold spaces), then plain flags. PowerShell needs the call operator before a
 * quoted path, and single quotes so `$` and backticks in a path stay literal.
 */
export function shellCommand(shell: HookShell, exe: string, script: string, ...args: string[]): string {
  if (shell === 'powershell') {
    // PowerShell reads the typographic single quotes (U+2018 to U+201B) as
    // quote marks too, so each is doubled like the ASCII one.
    const q = (s: string): string => `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`;
    return ['&', q(exe), q(script), ...args].join(' ');
  }
  // Single quotes in bash too: double quotes still expand `$` and fold the `\\`
  // of a UNC path. An embedded quote is closed, escaped and reopened.
  const q = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;
  return [q(exe), q(script), ...args].join(' ');
}
