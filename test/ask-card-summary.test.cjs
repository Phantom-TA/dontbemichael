'use strict';

/**
 * A card whose detail is in a file is a summary of it (owner, 2026-11-05).
 * Oscar's October cash flow report card put nine figures, each a grey code
 * chip, in one paragraph above the file that held them all. Now a card gives
 * the bold result, at most three key figures one per line, what needs the
 * owner, and the file; amounts are plain text and only a file is a chip.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const hive = fs.readFileSync(path.resolve(__dirname, '..', 'src/main/hive.ts'), 'utf8');

test('Michael writes a card with a file as a short summary, with plain amounts', () => {
  // Value: protects=the owner's card shape in Michael's Ask me rule, his report template and the shared protocol; fails_when=any of the three drops the three figure cap or puts amounts back in backticks; why_new=owner 2026-11-05 (the October cash flow card); seam=source pins; no_claim=whether Michael follows it (no eval)
  assert.ok(hive.includes('Write amounts and account names as plain text; put only a file in backticks, by its full path with its file ending, so the owner can open it.'));
  assert.ok(hive.includes('When a file holds the detail, the card is a summary of it: the bold line with the result or the decision, then at most three key figures, each on its own line as Label: amount, then one line on what needs the owner, if anything, then the file. Everything else stays in the file'));
  assert.ok(hive.includes('"q": "<one bold line with the result, then at most three key figures, each on its own line as Label: amount, then one line on what needs the owner, if anything, then the full paths of its files, each in backticks>"'), 'the report template');
  assert.ok(hive.includes('- \\`backticks\\` for file paths and commands only; amounts and account names stay plain text;'), 'the protocol');
  assert.doesNotMatch(hive, /Put amounts and account names in backticks/);
  assert.doesNotMatch(hive, /backticks\\` for paths, commands, values, and identifiers/);
});
