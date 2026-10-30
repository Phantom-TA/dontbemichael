'use strict';

/**
 * The owner's turn cap (Settings, maxTurns) is the most turns an agent may run.
 * A shared hire may bring its own --max-turns (hire.ts allows it), and before
 * this the app skipped its cap whenever the command already had one, so a link
 * could raise the owner's cap.
 *
 * Max turns per run (Settings → Agents) did nothing on its own: Claude Code
 * honours --max-turns in print mode only, and agents run as interactive
 * terminals. Checked with Claude Code 2.1.304: an interactive `--max-turns 1`
 * agent ran three tool calls and finished.
 *
 * So the cap is also counted at the hook boundary (turnCap.ts). The tests
 * after the flag ones pin that count and its wiring in HookServer.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { argsWithTurnCap } = loadTs('src/shared/agentProvider.ts');

test('a command\'s own --max-turns can lower the owner\'s cap but never raise it', () => {
  // Value: protects=the owner's runaway cap against a shared hire link; fails_when=a higher --max-turns in the command replaces the cap, a lower one is overruled, or the old value is left beside the new one; why_new=review of #539 found a hire's --max-turns 100000 skipped the owner's cap; seam=none
  assert.deepEqual(argsWithTurnCap(['--model', 'opus', '--max-turns', '100000'], 40), ['--model', 'opus', '--max-turns', '40'], 'a higher value is capped');
  assert.deepEqual(argsWithTurnCap(['--max-turns=100000', '--verbose'], 40), ['--verbose', '--max-turns', '40'], 'the = form too');
  assert.deepEqual(argsWithTurnCap(['--max-turns', '10', '--verbose'], 40), ['--verbose', '--max-turns', '10'], 'a lower value stays');
  assert.deepEqual(argsWithTurnCap(['--max-turns', '30', '--max-turns=90'], 40), ['--max-turns', '30'], 'the lowest of several wins, and only one is kept');
  assert.deepEqual(argsWithTurnCap(['--max-turns', 'lots'], 40), ['--max-turns', '40'], 'a value that is not a count gives way to the cap');
  assert.deepEqual(argsWithTurnCap(['--max-turns', '--verbose'], 40), ['--verbose', '--max-turns', '40'], 'a missing value never swallows the next flag');
  assert.deepEqual(argsWithTurnCap(['--model', 'opus'], 40), ['--model', 'opus', '--max-turns', '40'], 'no value of its own: the cap is added');
});

test('with no cap set, the command is left as it is', () => {
  const args = ['--model', 'opus', '--max-turns', '100000'];
  assert.equal(argsWithTurnCap(args, undefined), args);
  assert.equal(argsWithTurnCap(args, 0), args);
});

test('every spawn applies the cap through argsWithTurnCap', () => {
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main/index.ts'), 'utf8');
  assert.match(main, /argsWithTurnCap\(args, cfg\.maxTurns\)/);
  assert.doesNotMatch(main, /!args\.includes\('--max-turns'\)/, 'the old skip is gone');
});

// Max turns per run, counted by the hook server (turnCap.ts).

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    Notification: class {
      show() {}
      static isSupported() { return false; }
    }
  }
};

const { TurnCap } = loadTs('src/main/turnCap.ts');
const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');

test('no cap when Max turns is unset, zero or not a number', () => {
  const cap = new TurnCap();
  for (const max of [undefined, 0, -3, NaN, '5']) {
    for (let i = 0; i < 50; i++) assert.equal(cap.toolCall('oscar', max).stop, false, String(max));
  }
});

test('the call after the cap stops the run, and a new run starts the count again', () => {
  const cap = new TurnCap();
  assert.equal(cap.toolCall('oscar', 2).stop, false);
  assert.equal(cap.toolCall('oscar', 2).stop, false);
  const d = cap.toolCall('oscar', 2);
  assert.equal(d.stop, true);
  assert.match(d.reason, /limit of 2 turns per run/);
  assert.equal(cap.toolCall('oscar', 2).stop, true, 'stays stopped until the next prompt');
  cap.newRun('oscar');
  assert.equal(cap.toolCall('oscar', 2).stop, false);
});

test('each agent has its own count', () => {
  const cap = new TurnCap();
  assert.equal(cap.toolCall('oscar', 1).stop, false);
  assert.equal(cap.toolCall('oscar', 1).stop, true);
  assert.equal(cap.toolCall('pam', 1).stop, false);
});

test('the reason the owner reads has no dashes, and says "1 turn" for one', () => {
  const cap = new TurnCap();
  cap.toolCall('oscar', 1);
  const reason = cap.toolCall('oscar', 1).reason;
  assert.doesNotMatch(reason, /[-‐-―−]/);
  assert.match(reason, /limit of 1 turn per run/);
});

async function floor(t, config) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-turn-cap-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'oscar', name: 'Oscar', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => null, () => config, undefined, undefined);
  const send = (hook_event_name, over = {}) => server.handle({ agent_id: 'oscar', session_id: 's1', hook_event_name, cwd: home, ...over });
  const tool = (over) => send('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'echo hi' }, ...over });
  return { server, send, tool };
}

const stopped = (r) => !!r && r.continue === false;
const denied = (r) => !!r && r.hookSpecificOutput && r.hookSpecificOutput.permissionDecision === 'deny';

test('through the hook, the call past the cap is refused AND the run stops', async (t) => {
  const f = await floor(t, { maxTurns: 2 });
  await f.send('UserPromptSubmit');
  assert.ok(!stopped(await f.tool()));
  assert.ok(!stopped(await f.tool()));
  const r = await f.tool();
  // continue:false alone still runs this one call (checked live); the deny blocks it.
  assert.ok(stopped(r), 'the run stops');
  assert.ok(denied(r), 'and the call that went past the cap does not run');
  assert.equal(r.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(r.stopReason, /limit of 2 turns per run/);
});

test('a new prompt or a fresh session gives the agent a new run', async (t) => {
  const f = await floor(t, { maxTurns: 1 });
  await f.tool();
  assert.ok(stopped(await f.tool()));
  await f.send('UserPromptSubmit');
  assert.ok(!stopped(await f.tool()), 'a prompt resets the count');
  assert.ok(stopped(await f.tool()));
  await f.send('SessionStart', { source: 'startup' });
  assert.ok(!stopped(await f.tool()), 'a fresh session resets it too');
});

test('a compaction in the middle of a run keeps the count', async (t) => {
  const f = await floor(t, { maxTurns: 2 });
  await f.send('UserPromptSubmit');
  assert.ok(!stopped(await f.tool()));
  await f.send('SessionStart', { source: 'compact' });
  assert.ok(!stopped(await f.tool()));
  assert.ok(stopped(await f.tool()), 'the compaction did not give the agent a fresh count');
  await f.send('SessionStart', { source: 'compact' });
  assert.ok(stopped(await f.tool()), 'and does not end a stopped run either');
});

test('a subagent\'s tool calls are its own run, and its prompt does not reset the agent', async (t) => {
  const f = await floor(t, { maxTurns: 1 });
  for (let i = 0; i < 5; i++) assert.ok(!stopped(await f.tool({ subagent_id: 'sub1' })));
  assert.ok(!stopped(await f.tool()), 'the subagent did not use the agent\'s turns');
  assert.ok(stopped(await f.tool()));
  await f.send('UserPromptSubmit', { subagent_id: 'sub1' });
  assert.ok(stopped(await f.tool()), 'still stopped');
});

test('with no cap set, the hook never stops a run', async (t) => {
  const f = await floor(t, {});
  for (let i = 0; i < 30; i++) assert.ok(!stopped(await f.tool()));
});

test('an unreadable config skips only the cap: the folder walls still refuse', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-turn-cap-throw-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'pam', name: 'Pam', provider: 'claude', cwd: home });
  const server = new HookServer(hive, () => null, () => { throw new Error('config unreadable'); });
  const r = server.handle({ agent_id: 'pam', hook_event_name: 'PreToolUse', cwd: home, tool_name: 'Read', tool_input: { file_path: path.join(home, 'a.md') } });
  assert.ok(denied(r), 'the folder check still fails closed');
  assert.notEqual(r.continue, false, 'and it is not reported as the turn cap');
});

test('the call past the cap counts in Pulse as a step blocked by Max turns', async (t) => {
  const f = await floor(t, { maxTurns: 1 });
  const gates = [];
  f.server.onRefused = (agentId, gate) => gates.push([agentId, gate]);
  await f.send('UserPromptSubmit');
  await f.tool();
  assert.deepEqual(gates, [], 'a call inside the cap is not counted');
  await f.tool();
  assert.deepEqual(gates, [['oscar', 'turn-cap']]);
});

test('the backfill files a turn cap stop under Max turns, not the tool\'s own rule', () => {
  const { gateOfTool } = loadTs('src/main/pulseBackfill.ts');
  const { turnCapReason } = loadTs('src/main/turnCap.ts');
  assert.equal(gateOfTool('Bash', turnCapReason(3)), 'turn-cap', 'not the sandbox');
  assert.equal(gateOfTool('Read', turnCapReason(1)), 'turn-cap', 'not the folder walls');
  assert.equal(gateOfTool('AskUserQuestion', turnCapReason(2)), 'turn-cap', 'a question past the cap, as hooks.ts counts it live');
  assert.equal(gateOfTool('AskUserQuestion', 'Ask Michael instead.'), null, 'a routed question is still not a refusal');
});
