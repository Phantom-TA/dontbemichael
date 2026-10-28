'use strict';

/**
 * The fallback price table had one Sonnet row ($3 in, $15 out) and one Haiku
 * row ($0.80 in, $4 out). Sonnet 5 and 5.5 list at $2 and $10, Haiku 4.5 at
 * $1 and $5, and Haiku 5.5 at $0.10 and $0.50 for a prompt up to 100,000
 * tokens or $0.50 and $2.50 above it. Each id now resolves to its own row.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { priceFor, knownPrice, estimateCostUsd } = loadTs('src/main/pricing.ts');

const row = (model, prompt) => {
  const p = priceFor(model, prompt);
  return [p.inputPerM, p.outputPerM, p.cacheReadPerM, p.cacheWritePerM];
};

test('Sonnet is priced by version, and an older Sonnet keeps the old price', () => {
  // Value: protects=cost estimates for members on Sonnet; fails_when=Sonnet 5 or 5.5 is costed as Sonnet 4; why_new=one Sonnet row at the Sonnet 4 price; seam=priceFor
  for (const id of ['claude-sonnet-5-5', 'claude-sonnet-5-5[1m]', 'sonnet', 'claude-sonnet-6']) assert.deepEqual(row(id), [2, 10, 0.1, 2.5], id);
  for (const id of ['claude-sonnet-5', 'claude-sonnet-5[1m]']) assert.deepEqual(row(id), [2, 10, 0.2, 2.5], id);
  for (const id of ['claude-sonnet-4-6', 'claude-sonnet-4-5-20250929', 'claude-sonnet-4-20250514', 'claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022']) {
    assert.deepEqual(row(id), [3, 15, 0.3, 3.75], id);
  }
});

test('Haiku is priced by version, and Haiku 5.5 by the size of the prompt', () => {
  // Value: protects=cost estimates for members on Haiku; fails_when=Haiku 4.5 or 5.5 is costed as Haiku 3.5, or Haiku 5.5's band ignores the prompt size; why_new=one Haiku row at the Haiku 3.5 price; seam=priceFor
  assert.deepEqual(row('claude-haiku-5-5', 100_000), [0.1, 0.5, 0.01, 0.125]);
  assert.deepEqual(row('claude-haiku-5-5', 100_001), [0.5, 2.5, 0.05, 0.625]);
  assert.deepEqual(row('haiku', 2_000), [0.1, 0.5, 0.01, 0.125]);
  for (const id of ['claude-haiku-4-5', 'claude-haiku-4-5-20251001']) assert.deepEqual(row(id), [1, 5, 0.1, 1.25], id);
  assert.deepEqual(row('claude-3-5-haiku-20241022'), [0.8, 4, 0.08, 1]);
});

test('with no prompt size, Haiku 5.5 takes the higher band, so a projected saving is never overstated', () => {
  // Value: protects=Pulse's projected saving when a member moves to Haiku; fails_when=the lower band is assumed for long agent prompts; why_new=Haiku 5.5 has two bands; seam=priceFor, knownPrice
  assert.deepEqual(row('claude-haiku-5-5'), [0.5, 2.5, 0.05, 0.625]);
  assert.equal(knownPrice('claude-haiku-5-5'), 2.5);
  assert.equal(knownPrice('claude-sonnet-5-5'), 10);
  assert.equal(knownPrice('claude-haiku-4-5'), 5);
});

test('one response is priced by its own prompt: fresh input, cache reads and cache writes together', () => {
  // Value: protects=the transcript and proxy cost estimates for Haiku 5.5; fails_when=only fresh input decides the band; why_new=Haiku 5.5 has two bands; seam=estimateCostUsd
  const small = estimateCostUsd('claude-haiku-5-5', { inputTokens: 10_000, outputTokens: 1_000_000, cacheReadTokens: 50_000, cacheWriteTokens: 40_000 });
  assert.equal(Math.round(small * 1e6) / 1e6, Math.round((0.01 * 0.1 + 0.5 + 0.05 * 0.01 + 0.04 * 0.125) * 1e6) / 1e6);
  const large = estimateCostUsd('claude-haiku-5-5', { inputTokens: 10_000, outputTokens: 1_000_000, cacheReadTokens: 80_000, cacheWriteTokens: 20_000 });
  assert.equal(Math.round(large * 1e6) / 1e6, Math.round((0.01 * 0.5 + 2.5 + 0.08 * 0.05 + 0.02 * 0.625) * 1e6) / 1e6);
});

test('an unknown model still gets the old default row', () => {
  // Value: protects=the unknown model fallback stays as it was; fails_when=the default moves with the newest Sonnet; why_new=per version Sonnet rows; seam=priceFor
  assert.deepEqual(row('some-local-model'), [3, 15, 0.3, 3.75]);
});
