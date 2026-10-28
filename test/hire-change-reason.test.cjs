'use strict';

/**
 * The hire screen's "Couldn't work out the change" (owner, 2026-10-26): the
 * owner cleared the Name box, the screen kept calling the hire by the
 * character's name, but both checks sent the empty name. Main refuses a job
 * change with no name and the overlap check read no job, so every Try again
 * failed the same way and the overlap box showed "Distinct, the full check
 * could not run". Now both checks send the name the screen shows, and the
 * box says what went wrong and what to do.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: {} };

const W = loadTs('src/main/workStyleConvert.ts');
const H = loadTs('src/main/hireCheck.ts');
const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8');

const request = (name) => ({
  to: 'revise', requestId: 'r1',
  ctx: { name, title: 'Bookkeeper', business: { name: 'Pho' }, manager: 'Michael' },
  current: { instructions: 'Keep the books.', handles: 'Bookkeeping' },
  changes: ['also chase late invoices'], answers: []
});

test('a hire with the Name box cleared still sends a name to both checks', () => {
  // Value: protects=the hire screen's job change and overlap check run when the Name box is empty; fails_when=either check sends name.trim() again; why_new=the bug: both sent the empty name; seam=none; no_claim=the wizard's React render (source pin on the one line each)
  // Why it failed: an empty name is refused by both, on every try.
  assert.equal(W.readReviseRequest(request('')), null);
  assert.equal(H.readJobProfile({ name: '', title: 'Bookkeeper', routing: 'x', workStyle: 'y' }), null);
  assert.ok(W.readReviseRequest(request('Oscar')));
  const wizard = read('src/renderer/src/components/AddAgentModal.tsx');
  assert.match(wizard, /const hireWho = name\.trim\(\) \|\| CAST_BY_NAME\[character\]\.displayName;\n  const styleCtx = \(\) => \(\{ name: hireWho,/);
  assert.match(wizard, /const profile: JobProfile = \{\n    name: hireWho,/);
  assert.match(wizard, /const job: JobProfile = \{ name: hireWho,/);
  assert.doesNotMatch(wizard, /name: name\.trim\(\), title: title\.trim\(\)/, 'no check sends the raw box');
});

test('a job change that fails says why, from the hidden run\'s own reasons', () => {
  // Value: protects=each cause maps to its own line, and a request with no name is said as such and logged; fails_when=a reason collapses back to failed or the runner's wording drifts; why_new=every cause read "Try again in a moment"; seam=none; no_claim=a live signed-out Claude (hand check)
  const runner = read('src/main/hiddenClaude.ts');
  const quoted = (re) => { const m = re.exec(runner); assert.ok(m, String(re)); return m[1]; };
  const notStarted = quoted(/error: '(hidden session never took the prompt[^']*)'/);
  const slow = quoted(/error: '(hidden session timed out)'/);
  assert.equal(W.reviseFailure({ ok: false, error: notStarted }), 'not-started');
  assert.equal(W.reviseFailure({ ok: false, error: slow }), 'slow');
  assert.equal(W.reviseFailure({ ok: true, text: 'not json' }), 'unreadable');
  assert.equal(W.reviseFailure({ ok: false, error: 'cwd does not exist: /x' }), 'failed');
  const main = read('src/main/index.ts');
  assert.match(main, /if \(!rev\) \{\n[^]*?kind: 'work-style-revise-failed'[^]*?return \{ kind: 'error', reason: 'no-name' \};/);
  const box = read('src/renderer/src/components/JobChangeReview.tsx');
  assert.match(box, /\{ at: 'error', reason: res\.reason \}/);
  const keys = [...box.matchAll(/'(jobChange\.error[A-Za-z]+)'/g)].map((m) => m[1].split('.')[1]);
  for (const k of ['errorNoName', 'errorNotStarted', 'errorSlow', 'errorUnreadable']) assert.ok(keys.includes(k), k);
  for (const loc of ['en', 'ar', 'zh-CN']) {
    const jc = JSON.parse(read(`src/renderer/src/i18n/locales/${loc}.json`)).jobChange;
    for (const k of keys) assert.ok(jc[k], `${loc}: ${k}`);
  }
});
