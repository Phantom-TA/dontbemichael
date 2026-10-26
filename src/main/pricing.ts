/**
 * Fallback-only model → price table (USD per million tokens).
 *
 * The LIVE telemetry path does NOT use this. Claude Code emits a pre-computed,
 * per-model `cost_usd` on every `api_request` log and a `claude_code.cost.usage`
 * metric (verified by the 7A.1 spike), so the collector (`telemetry.ts`) trusts
 * Claude's own figure. This table exists solely for the OFFLINE transcript
 * reconciler (`transcript.ts`), which runs when telemetry is off and must
 * estimate cost from raw token counts.
 *
 * It supersedes the old hard-coded Sonnet-for-everyone constants that lived in
 * `transcript.ts` (cost bug #1 — Opus undercosted ~5×, Haiku overcosted). Prices
 * are now matched per model family. This is the ONE place per-model pricing
 * lives; both the transcript backend and the collector's fallback import it.
 */

/** USD per million tokens for one model family. */
export interface ModelPrice {
  inputPerM: number;
  outputPerM: number;
  cacheReadPerM: number;
  cacheWritePerM: number;
}

// Anthropic list prices, USD per million tokens. Approximate, fallback-only —
// the live path uses Claude's own per-model cost, so drift here is harmless.
// Each family by version, from platform.claude.com pricing (2026-10-25).
// Opus: 5.5 has its own row, 4.5 to 5 share one, 4.1 and older keep the old price.
const OPUS_5_5: ModelPrice = { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2, cacheWritePerM: 5 };
const OPUS_5: ModelPrice = { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 };
const OPUS_4: ModelPrice = { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 };
// Sonnet: 5.5 and 5 differ only in cache reads; 4.6 and older keep the old price.
const SONNET_5_5: ModelPrice = { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.1, cacheWritePerM: 2.5 };
const SONNET_5: ModelPrice = { inputPerM: 2, outputPerM: 10, cacheReadPerM: 0.2, cacheWritePerM: 2.5 };
const SONNET_4: ModelPrice = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };
// Haiku: 5.5 has two bands by the size of the prompt (fresh input, cache reads
// and cache writes of one request), the lower one up to 100,000 tokens.
const HAIKU_5_5: ModelPrice = { inputPerM: 0.1, outputPerM: 0.5, cacheReadPerM: 0.01, cacheWritePerM: 0.125 };
const HAIKU_5_5_LONG: ModelPrice = { inputPerM: 0.5, outputPerM: 2.5, cacheReadPerM: 0.05, cacheWritePerM: 0.625 };
const HAIKU_5_5_BAND = 100_000;
const HAIKU_4_5: ModelPrice = { inputPerM: 1, outputPerM: 5, cacheReadPerM: 0.1, cacheWritePerM: 1.25 };
const HAIKU_3_5: ModelPrice = { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1.0 };

// OpenAI list prices for the GPT-5 family Codex runs on. OpenAI bills no cache
// writes, and a cached input token costs a tenth of a fresh one. Newer point
// releases (gpt-5.x, gpt-5-codex) are priced as their family until listed here.
const GPT5: ModelPrice = { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.125, cacheWritePerM: 0 };
const GPT5_MINI: ModelPrice = { inputPerM: 0.25, outputPerM: 2, cacheReadPerM: 0.025, cacheWritePerM: 0 };
const GPT5_NANO: ModelPrice = { inputPerM: 0.05, outputPerM: 0.4, cacheReadPerM: 0.005, cacheWritePerM: 0 };

/** When the model id is unknown, assume Sonnet 4 (the historical default). */
const DEFAULT_PRICE: ModelPrice = SONNET_4;

/**
 * Strip Claude Code's variant suffix so `claude-opus-4-8[1m]` (the form the
 * `token.usage` metric carries) and `claude-opus-4-8` (the base id the
 * `api_request` log carries) resolve to the same family. Case is preserved;
 * matching is done case-insensitively in `priceFor`.
 */
export function normalizeModel(model: string | undefined | null): string {
  return (model ?? '').trim().replace(/\[[^\]]*\]\s*$/, '');
}

/**
 * A Claude id's version within its family: `opus-5-5`, `sonnet-4-5-20250929`
 * and `haiku-4.5` after the name, or `claude-3-5-sonnet` before it. Each part
 * is one or two digits, so a date such as the one in `claude-opus-4-20250514`
 * is never read as one. Infinity for the bare alias (`opus`, `sonnet`, `haiku`,
 * the newest of its family), so it and any version newer than the table get
 * the newest row.
 */
function claudeVersion(m: string, family: 'opus' | 'sonnet' | 'haiku'): number {
  const v = new RegExp(`${family}-(\\d{1,2})(?:[-.](\\d{1,2}))?(?!\\d)`).exec(m)
    ?? new RegExp(`(\\d{1,2})(?:[-.](\\d{1,2}))?-${family}`).exec(m);
  return v ? Number(v[1]) + Number(v[2] ?? 0) / 10 : Infinity;
}

function opusPrice(m: string): ModelPrice {
  const version = claudeVersion(m, 'opus');
  if (version >= 5.5) return OPUS_5_5;
  return version >= 4.5 ? OPUS_5 : OPUS_4;
}

function sonnetPrice(m: string): ModelPrice {
  const version = claudeVersion(m, 'sonnet');
  if (version >= 5.5) return SONNET_5_5;
  return version >= 5 ? SONNET_5 : SONNET_4;
}

function haikuPrice(m: string, promptTokens: number | undefined): ModelPrice {
  const version = claudeVersion(m, 'haiku');
  if (version >= 5.5) return promptTokens !== undefined && promptTokens <= HAIKU_5_5_BAND ? HAIKU_5_5 : HAIKU_5_5_LONG;
  return version >= 4.5 ? HAIKU_4_5 : HAIKU_3_5;
}

/**
 * Resolve a model id to its price row by family and version, falling back to
 * Sonnet 4. `promptTokens` (one request's fresh input, cache reads and cache
 * writes) picks Haiku 5.5's band; without it the higher band is used, so a
 * projected saving is never overstated.
 */
export function priceFor(model: string | undefined | null, promptTokens?: number): ModelPrice {
  const m = normalizeModel(model).toLowerCase();
  if (m.includes('opus')) return opusPrice(m);
  if (m.includes('haiku')) return haikuPrice(m, promptTokens);
  if (m.includes('sonnet')) return sonnetPrice(m);
  if (m.startsWith('gpt-') || m.includes('codex')) {
    if (m.includes('nano')) return GPT5_NANO;
    if (m.includes('mini')) return GPT5_MINI;
    return GPT5;
  }
  return DEFAULT_PRICE;
}

/** A model's output price per million tokens, only when the table really lists
 *  its family; undefined otherwise (priceFor would fall back to Sonnet). Pulse
 *  shows a projected saving only when both models have one. */
export function knownPrice(model: string | undefined | null): number | undefined {
  const m = normalizeModel(model).toLowerCase();
  if (!m) return undefined;
  if (m.includes('opus') || m.includes('haiku') || m.includes('sonnet') || m.startsWith('gpt-') || m.includes('codex')) return priceFor(m).outputPerM;
  return undefined;
}

/** Token split used by the cost estimator (matches `AgentUsage` token fields). */
export interface TokenSplit {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Estimate USD cost for a token split using the model's fallback price row.
 * Used only by the transcript reconciler; the live path trusts Claude's cost.
 * Each Claude caller passes one request, so its prompt size picks the band.
 */
export function estimateCostUsd(model: string | undefined | null, tokens: TokenSplit): number {
  const p = priceFor(model, tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens);
  return (
    (tokens.inputTokens / 1_000_000) * p.inputPerM +
    (tokens.outputTokens / 1_000_000) * p.outputPerM +
    (tokens.cacheReadTokens / 1_000_000) * p.cacheReadPerM +
    (tokens.cacheWriteTokens / 1_000_000) * p.cacheWritePerM
  );
}
