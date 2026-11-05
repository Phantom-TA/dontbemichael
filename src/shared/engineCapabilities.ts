/**
 * What each engine can do for an office member, in one table (issue #531).
 *
 * The spawn code decides much of this inline today, mostly with
 * `isClaudeProvider`: connectors, the per agent scratch folder, the system
 * prompt, the mailbox server, Research. Someone adding an engine to
 * `BUILD_ENGINES` had to find every one of those checks by hand. This table
 * says it in one place, and `engineGaps` answers what an engine is missing for
 * a given job on a given OS.
 *
 * Two kinds of fact live here:
 *  - Facts the presets already hold (lifecycle events, inbox, resume, the seed
 *    prompt, the protocol after a resume) are DERIVED from `agentProvider.ts`,
 *    never copied, so the two cannot drift. Lifecycle events and the protocol
 *    after a resume also read `NEVER_REPORTS` in `silentEngine.ts`: a hook on
 *    an engine with a version known never to report is `unknown`, since this
 *    table has no versions (#357).
 *  - Everything else is written down per engine. `unknown` means nobody has
 *    checked it on that engine yet; it is never read as `yes`.
 *
 * No call site reads this yet: replacing the inline checks comes later, one PR
 * at a time. Plain TypeScript with no imports from either side but the preset
 * registry and the silent engine rules, so the tests can run it.
 */
import { bridgeOf, providerPreset, type AgentProvider } from './agentProvider';
import { NEVER_REPORTS } from './silentEngine';

export type Support = 'yes' | 'no' | 'unknown';

/** The operating systems the app's code runs on (releases ship for the first two). */
export const ENGINE_OSES = ['darwin', 'win32', 'linux'] as const;
export type EngineOs = typeof ENGINE_OSES[number];

export type PerOs = Readonly<Record<EngineOs, Support>>;

/** The facts the presets do not hold. One entry per engine. */
export interface EngineFacts {
  /** The app can refuse a tool call before it runs, as the folder walls, the
   *  connector deny and the mail gate do through Claude's PreToolUse hook. A
   *  proxy bridge only watches traffic, so it can never refuse one (#139). */
  toolGuard: Support;
  /** The engine's own OS sandbox holds the member's shell to its folders.
   *  Claude Code has none on Windows (hive.ts, `failIfUnavailable`). `yes`
   *  exactly where `guardedWithoutReports` in silentEngine.ts says so, which a
   *  test holds. */
  fileSandbox: PerOs;
  /** The app reads how full the session's context window is (the gauge). */
  contextGauge: Support;
  /** The app reads the session's token use, so caps and cost views see it. */
  costData: Support;
  /** The md-mail server reaches the member, so a mailbox in its Capabilities
   *  gives it mail tools (#109). */
  mailTools: Support;
  /** Research (Pete) can run on it with its walls up. Research's walls are
   *  Claude Code's, so on any other engine it does not start (ship review D6.2). */
  researchWalls: Support;
  /** A member on this engine has been run live on this OS. */
  runsOn: PerOs;
}

/** Every fact `engineGaps` can be asked about. */
export const ENGINE_NEEDS = [
  // Derived from the preset.
  'seedPrompt',
  'lifecycleEvents',
  'inbox',
  'resume',
  // The member's identity and the hive protocol come back after a resume or a
  // compaction, by either route the preset's `instructionsDelivery` names: at
  // system level, or re-sent by the hook server on SessionStart (#298, #311).
  'systemPromptOnResume',
  // Written down per engine.
  'toolGuard',
  'fileSandbox',
  'contextGauge',
  'costData',
  'mailTools',
  'researchWalls',
  'runsOn'
] as const;
export type EngineNeed = typeof ENGINE_NEEDS[number];

const ALL_UNKNOWN: PerOs = { darwin: 'unknown', win32: 'unknown', linux: 'unknown' };

/** An engine nobody has run live with the office yet: its preset is wired,
 *  little else is known. The app has no reader for its context or token use,
 *  and the mail tools and Research are held to Claude in the spawn code. */
const UNCHECKED: EngineFacts = {
  toolGuard: 'unknown',
  fileSandbox: ALL_UNKNOWN,
  contextGauge: 'no',
  costData: 'no',
  mailTools: 'no',
  researchWalls: 'no',
  runsOn: ALL_UNKNOWN
};

/**
 * The table. `Record<AgentProvider, …>` makes a new engine id a type error
 * until it has an entry here, and test/engine-capabilities.test.cjs checks the
 * same at run time.
 */
export const ENGINE_FACTS: Readonly<Record<AgentProvider, EngineFacts>> = {
  claude: {
    toolGuard: 'yes',
    fileSandbox: { darwin: 'yes', win32: 'no', linux: 'yes' },
    contextGauge: 'yes',
    costData: 'yes',
    mailTools: 'yes',
    researchWalls: 'yes',
    // Releases ship for Mac and Windows 11; Linux does not ship yet (#35).
    runsOn: { darwin: 'yes', win32: 'yes', linux: 'unknown' }
  },
  codex: {
    // Its hooks reuse the Claude shim, but the guards match Claude's tool
    // names (Read, Write, mcp__md-mail__…), not Codex's.
    toolGuard: 'unknown',
    // `-s workspace-write` keeps Codex's own sandbox on in auto mode.
    fileSandbox: { darwin: 'yes', win32: 'unknown', linux: 'yes' },
    // Both read from its rollout in the agent's own CODEX_HOME (codexUsage.ts).
    contextGauge: 'yes',
    costData: 'yes',
    mailTools: 'no',
    researchWalls: 'no',
    runsOn: ALL_UNKNOWN
  },
  // Hook bridges: a PreToolUse event reaches the app, but nobody has checked
  // that a refusal holds on these engines.
  grok: UNCHECKED,
  // Gemini CLI 0.60 and later skip the per agent settings file that carries
  // its hooks (#315), so its lifecycle events read unknown (NEVER_REPORTS).
  // It runs in no OS sandbox anywhere (guardedWithoutReports).
  gemini: { ...UNCHECKED, fileSandbox: { darwin: 'no', win32: 'no', linux: 'no' } },
  antigravity: UNCHECKED,
  opencode: UNCHECKED,
  pi: UNCHECKED,
  // The proxy tier watches traffic: it can report, never refuse (#139). The
  // proxy reads usage from the responses, unchecked live.
  qwen: { ...UNCHECKED, toolGuard: 'no', costData: 'unknown' },
  crush: { ...UNCHECKED, toolGuard: 'no', costData: 'unknown' },
  // No bridge at all: nothing can refuse a tool call.
  kimi: { ...UNCHECKED, toolGuard: 'no' },
  copilot: { ...UNCHECKED, toolGuard: 'no' },
  cursor: { ...UNCHECKED, toolGuard: 'no' },
  custom: { ...UNCHECKED, toolGuard: 'no' }
};

const yesNo = (v: boolean): Support => (v ? 'yes' : 'no');

/** One need, on one engine, on one OS. Derived needs read the preset. */
export function engineSupport(engine: AgentProvider, os: EngineOs, need: EngineNeed): Support {
  const preset = providerPreset(engine);
  switch (need) {
    case 'seedPrompt':
      return yesNo(preset.hiveAware || !!preset.initialPromptFlag || !!preset.positionalInitialPrompt || !!preset.seedDelivery);
    case 'lifecycleEvents':
      if (!preset.hiveAware && !bridgeOf(engine)) return 'no';
      return NEVER_REPORTS.some((r) => r.engine === engine) ? 'unknown' : 'yes';
    case 'systemPromptOnResume':
      if (preset.instructionsDelivery === 'system-level') return 'yes';
      // Re-injection runs in the hook server, so an engine that never sends
      // SessionStart never gets it back. Through a hook it is wired but
      // unchecked live, and may never fire on an engine in NEVER_REPORTS.
      return bridgeOf(engine)?.kind === 'hooks' ? 'unknown' : 'no';
    case 'inbox':
      return yesNo(preset.canReceiveInbox);
    case 'resume':
      return yesNo(!!preset.resumeFlag || !!preset.resumeSubcommand);
    case 'fileSandbox':
    case 'runsOn':
      return ENGINE_FACTS[engine][need][os];
    default:
      return ENGINE_FACTS[engine][need];
  }
}

export interface EngineGap {
  need: EngineNeed;
  /** `no` is a known gap; `unknown` is one nobody has checked yet. */
  support: Exclude<Support, 'yes'>;
}

/** What `engine` is missing on `os` for the given needs, in the order asked.
 *  Empty when every need is a known `yes`. */
export function engineGaps(engine: AgentProvider, os: EngineOs, needs: readonly EngineNeed[]): EngineGap[] {
  const gaps: EngineGap[] = [];
  for (const need of needs) {
    const support = engineSupport(engine, os, need);
    if (support !== 'yes') gaps.push({ need, support });
  }
  return gaps;
}
