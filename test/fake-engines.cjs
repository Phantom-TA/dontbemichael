'use strict';

/**
 * Stand-ins for the engine CLIs (issue #443): no model, no account, no paid
 * call. Each one finds the hook commands the app installed where the real CLI
 * looks for them, runs them the way the CLI runs a command hook on Mac and
 * Linux (`sh -c`, the payload as JSON on stdin, the spawn's environment), and
 * reads the answer in the CLI's own contract.
 *
 * So a test can drive what HiveManager.ensureAgent hands an engine through the
 * same doors the engine uses, end to end into a real HookServer, without the
 * engine. test/hive-protocol-on-spawn.test.cjs pins what the app hands over;
 * these check that it works once handed over.
 *
 * Windows is not modelled yet: there Claude Code runs a hook through Git Bash
 * and the other CLIs through their own shells, and a stand-in that guessed
 * wrong would test itself rather than the app.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

/** The steps of one turn. Each CLI names their hook events its own way (`events`
 *  below), and every CLI here has a hook for each. A turn cut off by an API
 *  error (`failure`) is not one of them: only a CLI with a hook for it has it. */
const STEPS = ['start', 'prompt', 'preTool', 'postTool', 'stop'];

/** Claude Code reads its hooks from the `--settings` file on argv. */
function settingsArg(injection) {
  const i = injection.args.indexOf('--settings');
  if (i < 0 || !injection.args[i + 1]) throw new Error('no --settings on argv');
  return JSON.parse(fs.readFileSync(injection.args[i + 1], 'utf8'));
}

/** Codex reads `[[hooks.<Event>]]` tables from `$CODEX_HOME/config.toml`. Only
 *  the shape the app writes is read: a `command` basic string under its table. */
function codexHooks(injection) {
  const home = injection.env.CODEX_HOME;
  if (!home) throw new Error('no CODEX_HOME in the spawn env');
  const hooks = {};
  let event = null;
  for (const line of fs.readFileSync(path.join(home, 'config.toml'), 'utf8').split(/\r?\n/)) {
    const table = /^\[\[hooks\.([A-Za-z]+)\]\]$/.exec(line.trim());
    if (table) { event = table[1]; continue; }
    if (/^\[/.test(line.trim()) && !/^\[\[hooks\./.test(line.trim())) { event = null; continue; }
    const command = /^command\s*=\s*(".*")\s*$/.exec(line.trim());
    if (event && command) (hooks[event] ??= []).push({ hooks: [{ type: 'command', command: JSON.parse(command[1]) }] });
  }
  return hooks;
}

/** Gemini CLI reads hooks from the settings file its env points at. */
function geminiHooks(injection) {
  const file = injection.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH;
  if (!file) throw new Error('no GEMINI_CLI_SYSTEM_SETTINGS_PATH in the spawn env');
  return JSON.parse(fs.readFileSync(file, 'utf8')).hooks ?? {};
}

/** Claude Code's answer contract, which Codex shares (hive.ts installCodexHooks). */
const claudeAnswer = (out) => ({
  denied: out?.hookSpecificOutput?.permissionDecision === 'deny',
  reason: out?.hookSpecificOutput?.permissionDecisionReason,
  context: out?.hookSpecificOutput?.additionalContext,
  halted: out?.continue === false,
  stopReason: out?.stopReason
});

const ENGINES = {
  claude: {
    hooks: (injection) => settingsArg(injection).hooks ?? {},
    // The steps of a turn, by the name this CLI gives each hook event. Only a
    // CLI with a hook for a failed turn has `failure`: Claude Code's
    // StopFailure carries why in `error`, and its matcher reads that field.
    events: { start: 'SessionStart', prompt: 'UserPromptSubmit', preTool: 'PreToolUse', postTool: 'PostToolUse', stop: 'Stop', failure: 'StopFailure' },
    shellTool: 'Bash',
    answer: claudeAnswer
  },
  codex: {
    hooks: codexHooks,
    events: { start: 'SessionStart', prompt: 'UserPromptSubmit', preTool: 'PreToolUse', postTool: 'PostToolUse', stop: 'Stop' },
    // Codex's hook payloads are Claude shaped (hive.ts installCodexHooks).
    shellTool: 'Bash',
    answer: claudeAnswer
  },
  gemini: {
    hooks: geminiHooks,
    events: { start: 'SessionStart', prompt: 'BeforeAgent', preTool: 'BeforeTool', postTool: 'AfterTool', stop: 'AfterAgent' },
    shellTool: 'run_shell_command',
    answer: (out) => ({
      denied: out?.decision === 'deny',
      reason: out?.reason,
      context: out?.hookSpecificOutput?.additionalContext,
      halted: out?.continue === false,
      stopReason: out?.stopReason
    })
  }
};

/** Does a hook group's matcher take this call? A matcher reads the tool name,
 *  or a failure's `error`. No matcher, `*` and a regex that matches all count,
 *  as each CLI reads them. */
function matches(group, subject) {
  if (!group.matcher || group.matcher === '*' || subject === undefined) return true;
  try { return new RegExp(`^(?:${group.matcher})$`).test(subject); } catch { return false; }
}

function run(command, payload, env, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/sh', ['-c', command], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error(`hook timed out: ${command}`)); }, 15_000);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`hook exited ${code}: ${err.trim()}`));
      else resolve(out.trim());
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

/**
 * One fake CLI for `engine`, started from what ensureAgent returned. `step`
 * fires every hook the CLI would fire for that step of a turn and returns what
 * the CLI would read back. `env` overrides the spawn env for that one call (a
 * leftover process, a missing secret).
 */
function fakeEngine(engine, injection, { cwd, sessionId = 'fake-session' }) {
  const spec = ENGINES[engine];
  if (!spec) throw new Error(`no fake for ${engine}`);
  const hooks = spec.hooks(injection);
  return {
    hooks,
    shellTool: spec.shellTool,
    eventFor: (step) => spec.events[step],
    async step(step, { tool, input = {}, prompt, error, env } = {}) {
      const event = spec.events[step];
      if (!event) throw new Error(`${engine} has no hook for ${step}`);
      const toolName = step === 'preTool' || step === 'postTool' ? (tool ?? spec.shellTool) : undefined;
      const payload = {
        session_id: sessionId,
        cwd,
        hook_event_name: event,
        ...(toolName ? { tool_name: toolName, tool_input: input } : {}),
        ...(prompt ? { prompt } : {}),
        ...(error ? { error } : {})
      };
      const runEnv = { ...process.env, ...injection.env, ...env };
      for (const [k, v] of Object.entries(runEnv)) if (v === undefined) delete runEnv[k];
      const answers = [];
      for (const group of hooks[event] ?? []) {
        if (!matches(group, toolName ?? error)) continue;
        for (const hook of group.hooks ?? []) {
          if (hook.type !== 'command') continue;
          const out = await run(hook.command, payload, runEnv, cwd);
          answers.push(spec.answer(out ? JSON.parse(out) : null));
        }
      }
      return answers;
    }
  };
}

/** The member every office below starts. */
const AGENT = 'pam-1';

/** The Claude Code the stand-in plays: one new enough for every hook with a
 *  version floor (CLAUDE_HOOK_CLI_FLOOR). Without a version, hooksForCli leaves
 *  those hooks out, StopFailure among them. Derived, so a new floor follows. */
function claudeTakingEveryHook() {
  const loadTs = require('./load-ts.cjs');
  const { CLAUDE_HOOK_CLI_FLOOR } = loadTs('src/shared/modelCliFloor.ts');
  const { isNewer } = loadTs('src/shared/updateState.ts');
  return Object.values(CLAUDE_HOOK_CLI_FLOOR).reduce((a, b) => (isNewer(b, a) ? b : a));
}

/**
 * One office with one member on `engine`: spawned through
 * HiveManager.ensureAgent, a real HookServer listening on the hive socket, and
 * the stand-in CLI. The office and business folders both have a space in their
 * names, as real ones often do. `goal` is the member's standing goal; `onPlan`
 * receives what the hook stream tells the office break.
 */
async function officeOn(t, engine, { goal = null, onPlan } = {}) {
  const electron = require.resolve('electron');
  require.cache[electron] ??= {
    id: electron, filename: electron, loaded: true,
    exports: { Notification: class { show() {} static isSupported() { return false; } } }
  };
  const loadTs = require('./load-ts.cjs');
  const { HiveManager } = loadTs('src/main/hive.ts');
  const { HookServer } = loadTs('src/main/hooks.ts');
  const { ControlRegistry } = loadTs('src/main/control.ts');

  const base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'md-conf-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const home = path.join(base, 'Harness Home');
  const business = path.join(base, 'Pho Bakery');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(business, { recursive: true });

  const hive = new HiveManager(() => home);
  const injection = await hive.ensureAgent(
    { id: AGENT, name: 'Pam', provider: engine, cwd: business, isGod: false },
    { businessFolder: business, cliVersion: claudeTakingEveryHook() }
  );
  const events = [];
  const window = { send: (channel, payload) => { if (channel === 'hive:hookEvent') events.push(payload); }, isDestroyed: () => false };
  const control = new ControlRegistry();
  // HookServer takes its hooks by position. Every slot is named, so a new
  // constructor parameter cannot silently shift onPlan; engine-failures.test.cjs
  // also checks that plan signals arrive on every engine.
  const server = new HookServer(
    hive,
    () => window,
    () => ({ harnessHome: home }),
    control,
    /* breaker */ undefined,
    /* getStandingGoal */ (id) => (id === AGENT ? goal : null),
    /* onEvent */ undefined,
    /* getKnowledge */ undefined,
    /* getCompanyProfile */ undefined,
    /* roleReadsBooks */ undefined,
    /* memberPresent */ undefined,
    /* onPlan */ onPlan
  );
  server.start();
  t.after(() => server.stop());
  return { cli: fakeEngine(engine, injection, { cwd: business }), events, control, injection };
}

/** Engine CLIs must never reach the owner's real home: Codex links the login
 *  from ~/.codex into the member's own home. Call once at the top of a file. */
function isolateHome() {
  const fake = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'md-conf-home-')));
  process.env.HOME = fake;
  process.env.USERPROFILE = fake;
  process.on('exit', () => fs.rmSync(fake, { recursive: true, force: true }));
}

/** Does the stand-in for `engine` model this step? */
const hasStep = (engine, step) => !!ENGINES[engine]?.events[step];

module.exports = { fakeEngine, officeOn, isolateHome, hasStep, AGENT, STEPS, FAKE_ENGINES: Object.keys(ENGINES) };
