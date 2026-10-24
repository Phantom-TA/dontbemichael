'use strict';

/**
 * Eval: do the two prompts behind "Explain how they split it" behave on the
 * real models (eng D4)? The rewrite runs on the model main uses for it, the
 * check on the check's model, each through `claude -p` with no tools and
 * outside this shell's Claude Code session. Off by default, since it makes
 * several model calls; run it with:
 *
 *   OVERLAP_SPLIT_EVAL=1 node --test test/overlap-split-eval.test.cjs
 *
 * The cases:
 *  1. the owner's Kelly and Nick example: the explanation yields a handoff
 *     to Nick, and the check in change mode passes;
 *  2. an explanation that keeps both on the same work still overlaps;
 *  3. the tracking question is asked when a change names no place for the
 *     numbers, and not asked when it names one.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const ptyPath = require.resolve('node-pty');
require.cache[ptyPath] = { id: ptyPath, filename: ptyPath, loaded: true, exports: { spawn() { throw new Error('no real pty in tests'); } } };
const HM = loadTs('src/main/hiddenModel.ts');
const W = loadTs('src/main/workStyleConvert.ts');
const C = loadTs('src/main/hireCheck.ts');
const T = loadTs('src/shared/workStyleText.ts');
const { splitAgentRole } = loadTs('src/shared/agentRole.ts');

const skip = process.env.OVERLAP_SPLIT_EVAL === '1' ? false : 'set OVERLAP_SPLIT_EVAL=1 to run against the models';
const run = HM.runHiddenModel;
test.after(() => { HM.runHiddenModel = run; });

// The hidden call, made with `claude -p` on the model main asked for.
HM.runHiddenModel = async (prompt, opts) => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith('CLAUDE')) delete env[k];
  const r = spawnSync('claude', ['-p', '--model', opts.model, '--tools', '', '--strict-mcp-config'], { input: prompt, env, encoding: 'utf8', timeout: 180_000 });
  return r.status === 0 ? { ok: true, text: r.stdout } : { ok: false, error: r.stderr.slice(0, 300) || 'failed' };
};

const business = { name: 'Northwind Services' };
const ctx = { name: 'Kelly', title: 'Customer Support', business, manager: 'Michael' };
const deps = { engine: 'claude', command: 'claude', cwd: os.tmpdir() };
const opening = T.instructionsOpening(business);
const kellyNow = {
  instructions: `${opening}\n\n### The job\nYou answer customers who write to the support inbox, so they hear back the same day.\n\n### How to work\nLog each issue on its card. Ask the IT Engineer about bugs and outages, because they know the systems.`,
  handles: 'Answers customers who write to the support inbox and logs their issues. Send here for customer questions and complaints.'
};
const nick = {
  name: 'Nick', title: 'IT Engineer',
  routing: 'Answers technical questions from customers and the team: bugs, outages and how the product works. Send here for technical questions.',
  workStyle: 'You answer technical questions from customers and from Customer Support, and fix bugs and outages.'
};
const change = 'Kelly is also responsible for managing IT projects that result from winning a sales deal. She should track project milestones, hours spent and remaining hours in HubSpot.';
const teammates = [{ id: 'nick', name: 'Nick', title: 'IT Engineer' }];

const revise = (o) => W.reviseWorkStyle(W.readReviseRequest({ to: 'revise', ctx, current: kellyNow, changes: [change], ...o }), deps);
const check = (ok) => C.checkDistinct({ name: 'Kelly', title: 'Customer Support', routing: ok.handles, workStyle: ok.instructions }, [nick], { ...deps, mode: 'change' });

test('1. the owner\'s split writes a handoff to Nick and the check passes', { skip, timeout: 600_000 }, async () => {
  const ok = await revise({ explanation: 'Nick only handles technical questions. Kelly does not solve them: she routes them to Nick, gets the answers, and tracks them when they are part of an ongoing project or service contract.', teammates });
  assert.equal(ok.kind, 'ok', JSON.stringify(ok));
  assert.ok(ok.handoffs?.some((h) => h.toId === 'nick'), `expected a handoff to Nick: ${JSON.stringify(ok.handoffs)}`);
  assert.match(ok.handles, /Not for .+; that goes to Nick\./);
  const v = await check(ok);
  assert.equal(v.distinct, true, `still overlaps: ${v.why}`);
});

test('2. an explanation that keeps both on the same work still overlaps', { skip, timeout: 600_000 }, async () => {
  const ok = await revise({ explanation: 'Kelly also answers technical questions about bugs and outages herself, the same as Nick, whenever a customer asks.', teammates });
  assert.equal(ok.kind, 'ok', JSON.stringify(ok));
  const v = await check(ok);
  assert.equal(v.distinct, false, 'expected the check to stop it');
  assert.deepEqual(v.overlapsWith, ['Nick']);
});

test('3. the tracking question is asked only when the change names no place', { skip, timeout: 600_000 }, async () => {
  const asked = await W.reviseWorkStyle(W.readReviseRequest({ to: 'revise', ctx, current: kellyNow, changes: ['Kelly also tracks project milestones, hours spent and remaining hours for each client project.'], askHome: true }), deps);
  assert.equal(asked.kind, 'home', JSON.stringify(asked));
  assert.match(asked.question, /^Where should Kelly keep/);
  const named = await W.reviseWorkStyle(W.readReviseRequest({ to: 'revise', ctx, current: kellyNow, changes: [change], askHome: true }), deps);
  assert.equal(named.kind, 'ok', `asked although HubSpot was named: ${JSON.stringify(named)}`);
  assert.equal(splitAgentRole(`x: ${named.handles ?? ''}`).role, 'x');
});
