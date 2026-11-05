/**
 * What a member's terminal said on its way out (owner, 2026-10-30): a first
 * time owner's Michael exited at once on an option his Claude Code did not
 * know, and nothing outside his Work tab said so. The line is shown on the
 * owner's own screen only; the failure report carries the closed cause alone.
 *
 * Plain TypeScript with no imports from either side, so the tests can run it.
 */

/** Why an engine exited, as far as its last output tells. */
export const EXIT_CAUSES = ['unknown-option', 'signed-out', 'not-found', 'other'] as const;
export type ExitCause = (typeof EXIT_CAUSES)[number];

/** A member whose terminal ended by itself, until it starts again. */
export interface StoppedMember {
  agentId: string;
  isMichael: boolean;
  exitCode: number | null;
  signal: number | null;
  /** The line that says why, from its output; null when it printed nothing useful. */
  line: string | null;
  at: number;
}

/** Only the end of the tail: after a long session the rest is the member's
 *  own conversation, where any "error" or "can't" is business text. */
const LAST_LINES = 12;

/** Terminal output as plain lines: colour and cursor codes out. */
export function plainLines(tail: string | undefined): string[] {
  if (!tail) return [];
  return tail
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b[@-_]/g, '')
    .split(/\r?\n|\r/)
    // eslint-disable-next-line no-control-regex
    .map((l) => l.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '').trim())
    .filter(Boolean);
}

const SAYS_WHY = /\b(error|unknown|not found|no such|failed|invalid|denied|cannot|can't|not logged in)\b/i;
/** Lines the app itself writes into a terminal, never the engine's reason. */
const OWN_LINE = /process exited/i;

/** The line that says why it stopped: the last one that reads like an error,
 *  else the last line it printed; at most 200 characters. */
export function exitLine(tail: string | undefined): string | null {
  const lines = plainLines(tail).filter((l) => !OWN_LINE.test(l)).slice(-LAST_LINES);
  const why = [...lines].reverse().find((l) => SAYS_WHY.test(l)) ?? lines[lines.length - 1];
  if (!why) return null;
  return why.length > 200 ? `${why.slice(0, 199)}…` : why;
}

/** The closed cause a failure report may carry. */
export function exitCause(tail: string | undefined): ExitCause {
  const text = plainLines(tail).slice(-LAST_LINES).join('\n').toLowerCase();
  if (/unknown option|unknown argument|unrecognized option|unexpected argument/.test(text)) return 'unknown-option';
  if (/not logged in|please run \/login|invalid api key|authentication_error|oauth token has expired/.test(text)) return 'signed-out';
  if (/command not found|no such file or directory|enoent|is not recognized as an internal or external command/.test(text)) return 'not-found';
  return 'other';
}
