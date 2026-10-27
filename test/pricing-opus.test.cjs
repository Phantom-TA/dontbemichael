'use strict';

/**
 * The fallback price table had one Opus row, at the old Opus 4 list price
 * ($15 in, $75 out). Opus 5.5 lists at $4 and $20, and Opus 4.5 to 5 at $5
 * and $25, so a member on a current Opus was costed three to four times too
 * high. Each Opus id now resolves to its own version's row.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { priceFor, knownPrice, estimateCostUsd } = loadTs('src/main/pricing.ts');

const row = (model) => {
  const p = priceFor(model);
  return [p.inputPerM, p.outputPerM, p.cacheReadPerM, p.cacheWritePerM];
};

test('Opus 5.5 is priced at its own list price, in every id form', () => {
  // Value: protects=cost estimates for members on Opus 5.5; fails_when=Opus 5.5 is costed as an older Opus; why_new=one Opus row at the Opus 4 price; seam=priceFor
  for (const id of ['claude-opus-5-5', 'claude-opus-5-5[1m]', 'Claude-Opus-5.5', 'opus-5-5-thinking-high']) {
    assert.deepEqual(row(id), [4, 20, 0.2, 5], id);
  }
});

test('Opus 4.5 to 5 share one list price', () => {
  // Value: protects=cost estimates for members on Opus 5 and 4.x; fails_when=a version is matched to the wrong row; why_new=one Opus row at the Opus 4 price; seam=priceFor
  for (const id of ['claude-opus-5', 'claude-opus-5[1m]', 'claude-opus-4-8', 'claude-opus-4-8[1m]', 'claude-opus-4-8-high', 'claude-opus-4-7', 'claude-opus-4-6', 'claude-opus-4-5-20251101']) {
    assert.deepEqual(row(id), [5, 25, 0.5, 6.25], id);
  }
});

test('Opus 4, 4.1 and 3 keep the old list price, and a release date is not read as a version', () => {
  // Value: protects=older Opus ids stay at their real price; fails_when=a date suffix such as 20250514 is taken for a minor version; why_new=per version Opus rows; seam=priceFor
  for (const id of ['claude-opus-4-20250514', 'claude-opus-4-1-20250805', 'claude-opus-4-1', 'claude-3-opus-20240229']) {
    assert.deepEqual(row(id), [15, 75, 1.5, 18.75], id);
  }
});

test('the bare Opus alias and a newer Opus get the newest listed row', () => {
  // Value: protects=Claude Code's `opus` alias (the newest Opus) is costed as the newest one; fails_when=an unlisted Opus falls to an older, pricier row; why_new=per version Opus rows; seam=priceFor
  assert.deepEqual(row('opus'), [4, 20, 0.2, 5]);
  assert.deepEqual(row('claude-opus-6'), [4, 20, 0.2, 5]);
});

test('Pulse sees the same output price, and the estimate uses every column', () => {
  // Value: protects=the projected saving Pulse shows between models; fails_when=knownPrice and priceFor disagree; why_new=per version Opus rows; seam=knownPrice, estimateCostUsd
  assert.equal(knownPrice('claude-opus-5-5'), 20);
  assert.equal(knownPrice('claude-opus-4-8[1m]'), 25);
  const usd = estimateCostUsd('claude-opus-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 1_000_000, cacheWriteTokens: 1_000_000 });
  assert.equal(Math.round(usd * 100) / 100, 4 + 20 + 0.2 + 5);
});
