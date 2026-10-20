/**
 * Max turns per run (Settings → Agents), enforced at the hook boundary.
 *
 * Claude Code's own `--max-turns` works in print mode only (`-p`). Team members
 * run as interactive terminals, where the flag is accepted and silently
 * ignored: checked with Claude Code 2.1.304, `--max-turns 1` let an
 * interactive agent run three tool calls and finish. So the app counts instead.
 *
 * A run starts at the agent's prompt (UserPromptSubmit, or a fresh session) and
 * every tool call it makes after that is one turn. The call that would go past
 * the cap is refused AND the run is stopped: `continue: false` alone still lets
 * that call run first, and a refusal alone leaves the agent free to try again.
 * The next prompt starts a new run with a fresh count.
 *
 * LIMITS, stated plainly:
 *  - It counts tool calls, not model replies, so several tools called at once
 *    use several turns. That makes it stricter than print mode's cap, never looser.
 *  - A Task subagent's calls are its own run, as for the circuit breaker.
 *  - The PreToolUse hook fails OPEN when the agent can't reach the app's socket,
 *    so this is a coarse runaway guard, not a hard limit.
 *
 * Pure: no fs, no electron. The hook server feeds it events.
 */

export class TurnCap {
  private used = new Map<string, number>();

  /** A prompt or a fresh session starts a new run. */
  newRun(agentId: string): void {
    this.used.delete(agentId);
  }

  /** One tool call. `stop` when it would go past `max`; no cap when `max` is unset. */
  toolCall(agentId: string, max: number | undefined): { stop: boolean; reason?: string } {
    if (typeof max !== 'number' || !Number.isFinite(max) || max < 1) return { stop: false };
    const n = (this.used.get(agentId) ?? 0) + 1;
    if (n > max) return { stop: true, reason: turnCapReason(max) };
    this.used.set(agentId, n);
    return { stop: false };
  }
}

/** Shown in the agent's terminal, so the owner reads it too. */
export function turnCapReason(max: number): string {
  return `Stopped at the limit of ${max} ${max === 1 ? 'turn' : 'turns'} per run (Settings, Agents). Send a new message to carry on.`;
}
