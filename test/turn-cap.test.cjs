'use strict';

/**
 * The owner's turn cap (Settings, maxTurns) is the most turns an agent may run.
 * A shared hire may bring its own --max-turns (hire.ts allows it), and before
 * this the app skipped its cap whenever the command already had one, so a link
 * could raise the owner's cap.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
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
