'use strict';
/**
 * Test instructions delivery channels across agent providers (#298).
 *
 * Verifies that:
 * - Engines with native system instructions (Claude, Codex, Gemini) deliver the hive
 *   protocol at the system/developer level, so roles and house rules survive compaction
 *   and session resume.
 * - Codex spawn argv does not carry the protocol positional; CODEX_HOME/config.toml
 *   carries developer_instructions with role and house rules.
 * - Codex resume after editing work style updates the config.toml with the new text.
 * - Gemini CLI spawn sets GEMINI_SYSTEM_MD pointing to system.md containing the protocol.
 * - Engines without a native system channel (Grok, Crush, etc.) receive protocol
 *   re-injection via HookServer additionalContext on compaction and resume.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    Notification: class {
      constructor(opts) { this.opts = opts; }
      show() {}
      static isSupported() { return true; }
    }
  }
};

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');
const { providerPreset, ON_SHIFT_PROMPT } = loadTs('src/shared/agentProvider.ts');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-instr-deliv-'));
}

test('Codex spawn writes developer_instructions into config.toml and omits protocol from argv', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  const cwd = path.join(home, 'biz', 'dev');
  fs.mkdirSync(cwd, { recursive: true });

  const injection = await hive.ensureAgent({
    id: 'dev-1',
    name: 'Dwight',
    provider: 'codex',
    cwd
  });

  // 1. CODEX_HOME is in the agent directory
  const codexHome = injection.env.CODEX_HOME;
  assert.ok(codexHome, 'CODEX_HOME must be set');
  const configPath = path.join(codexHome, 'config.toml');
  assert.ok(fs.existsSync(configPath), 'config.toml must exist in CODEX_HOME');

  const configContent = fs.readFileSync(configPath, 'utf8');
  assert.ok(configContent.includes('developer_instructions ='), 'config.toml must define developer_instructions');
  assert.ok(configContent.includes('HOUSE RULES'), 'developer_instructions must contain house rules');

  // 2. Argv positional argument is the short on-shift prompt, not the protocol
  const lastArg = injection.args[injection.args.length - 1];
  assert.equal(lastArg, ON_SHIFT_PROMPT, 'Codex initial positional prompt must be the short on-shift prompt');
  assert.ok(!injection.args.some((arg) => arg.includes('HOUSE RULES')), 'argv must not contain the protocol positional');
});

test('Codex writeCodexInstructions updates developer_instructions in config.toml', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  const cwd = path.join(home, 'biz', 'dev');
  fs.mkdirSync(cwd, { recursive: true });

  const injection = await hive.ensureAgent({
    id: 'dev-2',
    name: 'Angela',
    provider: 'codex',
    cwd
  });

  const codexHome = injection.env.CODEX_HOME;
  const configPath = path.join(codexHome, 'config.toml');
  let configContent = fs.readFileSync(configPath, 'utf8');
  assert.ok(configContent.includes('HOUSE RULES'), 'initial config.toml must contain house rules');

  // Update instructions as happens on resume
  const updatedPrompt = 'UPDATED PROTOCOL INSTRUCTIONS';
  hive.writeCodexInstructions(codexHome, updatedPrompt);

  configContent = fs.readFileSync(configPath, 'utf8');
  assert.ok(configContent.includes(updatedPrompt), 'updated config.toml must contain updated instructions');
  assert.ok(!configContent.includes('HOUSE RULES'), 'updated config.toml replaced previous instructions');
});

test('Gemini CLI spawn writes GEMINI.md in agent dir and uses short shift prompt', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  const cwd = path.join(home, 'biz', 'gemini');
  fs.mkdirSync(cwd, { recursive: true });

  const injection = await hive.ensureAgent({
    id: 'support-1',
    name: 'Kelly',
    provider: 'gemini',
    cwd
  });

  // GEMINI.md context file must exist in the agent directory
  const agentDir = hive.agentDir('support-1');
  const geminiMdPath = path.join(agentDir, 'GEMINI.md');
  assert.ok(fs.existsSync(geminiMdPath), 'GEMINI.md context file must exist in agent dir');

  const content = fs.readFileSync(geminiMdPath, 'utf8');
  assert.ok(content.includes('HOUSE RULES'), 'GEMINI.md must contain house rules');
  assert.equal(injection.env.GEMINI_SYSTEM_MD, undefined, 'GEMINI_SYSTEM_MD must not be set');

  // Argv uses -i with the short on-shift prompt
  const flagIndex = injection.args.indexOf('-i');
  assert.ok(flagIndex !== -1, 'Gemini args must contain -i');
  assert.equal(injection.args[flagIndex + 1], ON_SHIFT_PROMPT, '-i prompt must be the short on-shift prompt');
  assert.ok(!injection.args.some((arg) => arg.includes('HOUSE RULES')), 'argv must not contain the protocol');
});

test('Engine with no system channel re-injects protocol on SessionStart compact and resume', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  const cwd = path.join(home, 'biz', 'grok');
  fs.mkdirSync(cwd, { recursive: true });

  await hive.ensureAgent({
    id: 'grok-1',
    name: 'Creed',
    provider: 'grok',
    cwd
  });

  const server = new HookServer(hive, () => null, () => ({}), undefined, undefined);

  // 1. SessionStart with source: "compact" re-injects protocol into additionalContext
  const compactRes = server.handle({
    agent_id: 'grok-1',
    hook_event_name: 'SessionStart',
    source: 'compact',
    session_id: 'sess-1'
  });
  const compactContext = compactRes?.hookSpecificOutput?.additionalContext;
  assert.ok(compactContext, 'SessionStart on compact must return additionalContext');
  assert.ok(compactContext.includes('You are "Creed"'), 'additionalContext must include agent identity');
  assert.ok(compactContext.includes('HOUSE RULES'), 'additionalContext must include house rules');

  // 2. SessionStart with source: "resume" re-injects protocol into additionalContext
  const resumeRes = server.handle({
    agent_id: 'grok-1',
    hook_event_name: 'SessionStart',
    source: 'resume',
    session_id: 'sess-2'
  });
  const resumeContext = resumeRes?.hookSpecificOutput?.additionalContext;
  assert.ok(resumeContext, 'SessionStart on resume must return additionalContext');
  assert.ok(resumeContext.includes('You are "Creed"'), 'additionalContext on resume must include agent identity');

  // 3. Normal SessionStart (not compact or resume) does not re-inject protocol
  const normalRes = server.handle({
    agent_id: 'grok-1',
    hook_event_name: 'SessionStart',
    source: 'startup',
    session_id: 'sess-3'
  });
  const normalContext = normalRes?.hookSpecificOutput?.additionalContext ?? '';
  assert.ok(!normalContext.includes('HOUSE RULES'), 'normal SessionStart must not duplicate the protocol');
});

test('Engines with native system-level instructions do not re-inject on SessionStart compact', async (t) => {
  const home = tmpHome();
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const hive = new HiveManager(() => home);
  const cwd = path.join(home, 'biz', 'claude');
  fs.mkdirSync(cwd, { recursive: true });

  await hive.ensureAgent({
    id: 'claude-1',
    name: 'Jim',
    provider: 'claude',
    role: 'Sales representative',
    cwd
  });

  const server = new HookServer(hive, () => null, () => ({}), undefined, undefined);
  const res = server.handle({
    agent_id: 'claude-1',
    hook_event_name: 'SessionStart',
    source: 'compact',
    session_id: 'sess-claude'
  });
  const context = res?.hookSpecificOutput?.additionalContext ?? '';
  assert.ok(!context.includes('HOUSE RULES'), 'Claude Code has native system prompt and must not re-inject protocol');
});
