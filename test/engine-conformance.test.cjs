'use strict';

/**
 * One set of checks run against every engine an office member can run on
 * (issue #443), with a stand-in CLI per engine (test/fake-engines.cjs) instead
 * of the real one, so nothing is paid for and nothing needs an account.
 *
 * Each engine is spawned through HiveManager.ensureAgent exactly as the app
 * does, its stand-in finds the hooks the app installed where the real CLI
 * looks for them, and every hook runs end to end into a real HookServer on
 * the hive socket. A member on any engine must:
 *  - take its standing goal when a session starts;
 *  - report a tool call and the end of its turn as itself;
 *  - have a tool call refused, in its own engine's answer, when it is paused;
 *  - never be heard without its own per start secret (issue #61).
 *
 * The office and business folders both have a space in their names
 * (officeOn). The engines are those with a hook bridge the issue names:
 * Claude Code, Codex and Gemini CLI. Mac and Linux only for now (see
 * fake-engines.cjs).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { posixOnly } = require('./platform.cjs');
const { officeOn, isolateHome, AGENT, STEPS, FAKE_ENGINES } = require('./fake-engines.cjs');

isolateHome();

const GOAL = 'Keep the books tidy and answer supplier mail first.';
const office = (t, engine) => officeOn(t, engine, { goal: GOAL });

const heard = (events, event) => events.filter((e) => e.event === event);

test('the stand-ins cover the engines with a hook bridge the issue names', () => {
  // Value: protects=the suite keeps covering Claude Code, Codex and Gemini CLI; fails_when=an engine's stand-in is dropped or renamed; why_new=issue #443; seam=none
  assert.deepEqual(FAKE_ENGINES, ['claude', 'codex', 'gemini']);
});

for (const engine of FAKE_ENGINES) {
  test(`${engine}: the app installs a hook for every step of a turn, where the CLI reads it`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    // Value: protects=every lifecycle step has a hook in the file this CLI reads; fails_when=an installer drops an event or writes it where the CLI does not look; why_new=issue #443; seam=stand-in CLI
    const { cli } = await office(t, engine);
    for (const step of STEPS) {
      const groups = cli.hooks[cli.eventFor(step)] ?? [];
      assert.ok(groups.some((g) => (g.hooks ?? []).some((h) => h.type === 'command' && h.command)), `${engine}: no hook for ${cli.eventFor(step)}`);
    }
  });

  test(`${engine}: a new session takes the member's standing goal`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    // Value: protects=a member on any engine learns its standing goal when a session starts; fails_when=the bridge drops SessionStart or loses its additional context on the way back; why_new=issue #443, TODOS gap 5; seam=stand-in CLI into a real HookServer
    const { cli, events } = await office(t, engine);
    const answers = await cli.step('start');
    assert.ok(answers.some((a) => typeof a.context === 'string' && a.context.includes(GOAL)),
      `${engine}: the goal did not come back to the CLI at session start`);
    assert.deepEqual(heard(events, 'SessionStart').map((e) => e.agentId), [AGENT]);
  });

  test(`${engine}: a tool call and the end of the turn are reported as the member`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    // Value: protects=live status and turn ends reach the window as the right member; fails_when=a shim maps an event wrongly, loses the tool name, or speaks as nobody; why_new=issue #443; seam=stand-in CLI into a real HookServer
    const { cli, events } = await office(t, engine);
    await cli.step('start');
    await cli.step('prompt', { prompt: 'Check the supplier invoices.' });
    const pre = await cli.step('preTool', { input: { command: 'ls' } });
    assert.ok(pre.length && pre.every((a) => !a.denied), `${engine}: an ordinary tool call was refused`);
    await cli.step('postTool', { input: { command: 'ls' } });
    await cli.step('stop');
    for (const event of ['PreToolUse', 'PostToolUse', 'Stop']) {
      assert.deepEqual(heard(events, event).map((e) => e.agentId), [AGENT], `${engine}: ${event}`);
    }
    assert.equal(heard(events, 'PreToolUse')[0].tool, cli.shellTool);
  });

  test(`${engine}: a paused member's tool call is refused in the engine's own answer`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    // Value: protects=a refusal from the app holds on every engine, in the answer shape that engine reads; fails_when=a shim drops or mistranslates the deny, or resuming leaves it on; why_new=issue #443; seam=stand-in CLI into a real HookServer
    const { cli, control } = await office(t, engine);
    control.pause(AGENT, true);
    const answers = await cli.step('preTool', { input: { command: 'rm -rf invoices' } });
    assert.ok(answers.some((a) => a.denied && /Paused/.test(a.reason ?? '')), `${engine}: the refusal did not reach the CLI as a refusal`);
    control.pause(AGENT, false);
    assert.ok((await cli.step('preTool', { input: { command: 'ls' } })).every((a) => !a.denied), `${engine}: resuming did not lift it`);
  });

  test(`${engine}: a hook without the member's own secret is heard by nobody`, posixOnly('the stand-in CLIs run hooks with sh'), async (t) => {
    // Value: protects=no process can speak for a member without its per start secret (#61); fails_when=a shim stops sending the secret, or the server trusts a frame without one; why_new=issue #443; seam=stand-in CLI into a real HookServer
    const { cli, events } = await office(t, engine);
    await cli.step('stop', { env: { HIVE_HOOK_SEAL: undefined } });
    await cli.step('stop', { env: { HIVE_HOOK_SEAL: 'from-an-earlier-start' } });
    assert.deepEqual(heard(events, 'Stop'), [], `${engine}: a frame with no secret or an old one reached the app`);
    await cli.step('stop');
    assert.deepEqual(heard(events, 'Stop').map((e) => e.agentId), [AGENT], 'with its own secret it is heard');
  });
}
