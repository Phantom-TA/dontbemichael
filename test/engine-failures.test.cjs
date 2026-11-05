'use strict';

/**
 * The rest of a turn's lifecycle on every engine (issue #443, after the
 * shared checks in engine-conformance.test.cjs): a turn cut off by a sign in
 * that stopped working, by no credit or by a usage limit, and a member the
 * app stops. Each runs through a stand-in CLI (test/fake-engines.cjs) end to
 * end into a real HookServer, with no model and no paid call.
 *
 * A failure must reach the office break (src/main/officeBreak.ts) as its own
 * reason, because that reason decides what the owner is told and whether a
 * Needs you card asks them to act. Only Claude Code has a hook for a failed
 * turn today (StopFailure). The app installs none for Codex or Gemini CLI, so
 * a quota or sign in stop there is not seen; that gap is pinned below, so a
 * bridge that adds one has to join these checks.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { posixOnly } = require('./platform.cjs');
const { officeOn, isolateHome, hasStep, AGENT, FAKE_ENGINES } = require('./fake-engines.cjs');

isolateHome();

const { OfficeBreak } = loadTs('src/main/officeBreak.ts');
const { stopNeedsOwner } = loadTs('src/shared/officeBreak.ts');

const SH = posixOnly('the stand-in CLIs run hooks with sh');
/** Run where the stand-ins run, and only on an engine with a hook for a failed turn. */
const failing = (engine) => (SH.skip || hasStep(engine, 'failure') ? SH : { skip: `${engine} has no hook for a failed turn (pinned above)` });

/** An office whose plan signals feed a real OfficeBreak, wired as index.ts
 *  wires them for a stop (limitReached on a `limit` signal). A simplified copy:
 *  index.ts also passes `retry` (false for an API key that stopped working),
 *  which this leaves out, so these tests say nothing about the retry rule. */
async function office(t, engine) {
  let saved = null;
  const officeBreak = new OfficeBreak({ load: () => saved, save: (s) => { saved = s; } }, () => 1_000_000);
  const signals = [];
  const ctx = await officeOn(t, engine, {
    onPlan: (signal) => {
      signals.push(signal);
      if (signal.kind === 'limit') officeBreak.limitReached(signal.agentId, signal.reason);
    }
  });
  return { ...ctx, officeBreak, signals };
}

test('the app installs a hook for a failed turn on Claude Code only, and the stand-ins model exactly that', SH, async (t) => {
  // Value: protects=the Codex and Gemini CLI gap stays recorded against what the app installs; fails_when=a bridge gains or loses a StopFailure hook without the stand-ins and this list following; why_new=issue #443; seam=installed hook files
  const engines = [];
  for (const engine of FAKE_ENGINES) {
    const { cli } = await office(t, engine);
    const installed = Object.prototype.hasOwnProperty.call(cli.hooks, 'StopFailure');
    assert.equal(hasStep(engine, 'failure'), installed, `${engine}: the stand-in and the installed hooks disagree`);
    if (installed) engines.push(engine);
  }
  // A Codex or Gemini CLI bridge that learns to report a failed turn changes
  // this list, and its stand-in event then runs the checks below.
  assert.deepEqual(engines, ['claude']);
});

for (const engine of FAKE_ENGINES) {
  test(`${engine}: a prompt and a finished turn reach the office break`, SH, async (t) => {
    // Value: protects=the office break hears every engine's prompts and turn ends, which end a break; fails_when=onPlan shifts to another HookServer slot, or a bridge drops UserPromptSubmit or Stop on the way in; why_new=review of #580; seam=stand-in CLI into a real HookServer
    const { cli, signals } = await office(t, engine);
    await cli.step('prompt', { prompt: 'Check the supplier invoices.' });
    await cli.step('stop');
    assert.deepEqual(signals, [{ kind: 'prompt', agentId: AGENT }, { kind: 'turn', agentId: AGENT }], engine);
  });

  test(`${engine}: a sign in that stopped working, no credit and a usage limit each reach the owner as their own reason`, failing(engine), async (t) => {
    // Value: protects=each stop reaches the office break as its own reason, so the owner is told the right thing; fails_when=STOP_ERRORS loses a mapping, StopFailure sends the wrong reason, or the matcher drops one; why_new=issue #443; seam=stand-in CLI into a real HookServer and OfficeBreak
    for (const [error, reason, ownerActs] of [
      ['authentication_failed', 'signin', true],
      ['billing_error', 'credit', true],
      ['rate_limit', 'limit', false]
    ]) {
      const { cli, officeBreak, signals } = await office(t, engine);
      await cli.step('start');
      await cli.step('failure', { error });
      assert.deepEqual(signals.filter((s) => s.kind === 'limit'), [{ kind: 'limit', agentId: AGENT, reason }], `${engine} ${error}`);
      const view = officeBreak.view();
      assert.equal(view?.reason, reason, `${engine} ${error}: the office stops for that reason`);
      assert.equal(stopNeedsOwner(view), ownerActs, `${engine} ${error}: ${ownerActs ? 'a Needs you card asks the owner' : 'a break that ends on its own'}`);
    }
  });

  test(`${engine}: a turn that fails for any other reason ends that turn only`, failing(engine), async (t) => {
    // Value: protects=a passing server error never stops the whole office; fails_when=the StopFailure matcher widens to every error; why_new=issue #443; seam=stand-in CLI into a real HookServer
    const { cli, officeBreak, signals } = await office(t, engine);
    for (const error of ['server_error', 'invalid_request', 'max_output_tokens']) {
      assert.deepEqual(await cli.step('failure', { error }), [], `${engine} ${error}: no hook runs for it`);
    }
    assert.deepEqual(signals.filter((s) => s.kind === 'limit'), []);
    assert.equal(officeBreak.view(), null, 'the office keeps working');
  });

  test(`${engine}: a member the app stops ends its turn cleanly, in the engine's own answer`, SH, async (t) => {
    // Value: protects=the app's stop (voice or control strip) ends the turn on every engine; fails_when=the halt answer is lost, or a shim drops continue false; why_new=issue #443; seam=stand-in CLI into a real HookServer
    const { cli, control, events } = await office(t, engine);
    await cli.step('start');
    control.halt(AGENT);
    const answers = await cli.step('preTool', { input: { command: 'ls' } });
    assert.ok(answers.some((a) => a.halted && /Halted/.test(a.stopReason ?? '')),
      `${engine}: the stop did not reach the CLI as an end of the turn`);
    assert.ok(events.some((e) => e.event === 'PreToolUse' && e.agentId === AGENT), `${engine}: the window still hears where it stopped`);
  });
}
