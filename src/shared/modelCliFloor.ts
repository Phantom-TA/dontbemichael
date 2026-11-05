/**
 * Claude models that need a minimum Claude Code version, and what to run instead
 * on an older one.
 *
 * Opus 5.5 needs Claude Code 2.1.280 or later (Anthropic's model-config docs). An
 * older CLI rejects the id, and for Michael that is an office whose manager never
 * starts. The app installs the latest Claude Code on a new Mac, but an owner who
 * already had it may be behind, so every spawn checks: a model this CLI is too
 * old for is swapped for its fallback, and the swap is logged.
 *
 * Pure, so the renderer and tests share it with main.
 */
import { isNewer } from './updateState';

export interface CliFloor {
  /** Oldest Claude Code version that can run the model. */
  min: string;
  /** What runs instead on an older CLI: the newest model that version knows. */
  fallback: string;
}

export const CLAUDE_MODEL_CLI_FLOOR: Readonly<Record<string, CliFloor>> = {
  'claude-opus-5-5': { min: '2.1.280', fallback: 'claude-opus-5' },
  'claude-opus-5-5[1m]': { min: '2.1.280', fallback: 'claude-opus-5' }
};

export interface ModelForCli {
  model: string;
  /** Set when the requested model was swapped for its fallback. */
  downgraded?: { from: string; need: string; have: string };
}

/**
 * The model to actually launch with, given the installed Claude Code version.
 * An unknown version (the probe failed) keeps the requested model: the check is
 * a safety net, and guessing "too old" would quietly take Opus 5.5 away from
 * owners whose CLI is fine. The CLI still reports a bad id itself.
 */
export function modelForCli(model: string, cliVersion: string | null): ModelForCli {
  const floor = CLAUDE_MODEL_CLI_FLOOR[model];
  if (!floor || !cliVersion || !/\d+\.\d+\.\d+/.test(cliVersion)) return { model };
  if (!isNewer(floor.min, cliVersion)) return { model };
  return { model: floor.fallback, downgraded: { from: model, need: floor.min, have: cliVersion } };
}

/**
 * Hook events the app registers that an older Claude Code does not know, with
 * the first version that takes each. An older one refuses the WHOLE settings
 * file over a name it does not know: a Settings Error prompt, then no hooks, no
 * sandbox and no deny rules, or an agent that never starts (owner, 2026-10-30).
 * A hook new enough to be missing from a CLI still in use belongs in this list
 * (claude-hook-floor.test.cjs fails until it is).
 *
 * Newer ones still stop on a Settings Warning prompt until someone answers it.
 * PostToolBatch is in no changelog, so its floor is from the releases
 * themselves: 2.1.117 lacks it, 2.1.118 has it. The other two are from the
 * changelog.
 */
export const CLAUDE_HOOK_CLI_FLOOR: Readonly<Record<string, string>> = {
  PostCompact: '2.1.76',
  StopFailure: '2.1.78',
  PostToolBatch: '2.1.118'
};

/** The hooks this Claude Code takes, the rest left out. A version nobody could
 *  read leaves out every hook with a floor: a missing hook costs far less than
 *  a refused file. */
export function hooksForCli<T>(hooks: Record<string, T>, cliVersion: string | null | undefined): Record<string, T> {
  const have = cliVersion && /\d+\.\d+\.\d+/.test(cliVersion) ? cliVersion : null;
  return Object.fromEntries(Object.entries(hooks).filter(([event]) => {
    const min = CLAUDE_HOOK_CLI_FLOOR[event];
    return !min || (!!have && !isNewer(min, have));
  }));
}

/** The long options `claude --help` lists ("--remote-control-session-name-prefix <prefix>"). */
export function parseCliFlags(help: string): Set<string> {
  return new Set([...help.matchAll(/(?:^|[\s,])(--[a-zA-Z][a-zA-Z0-9-]*)/g)].map((m) => m[1]));
}

/** Pull `2.1.280` out of `claude --version` output ("2.1.280 (Claude Code)"). */
export function parseCliVersion(output: string): string | null {
  const m = /(\d+\.\d+\.\d+)/.exec(output);
  return m ? m[1] : null;
}
