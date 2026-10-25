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
// Opus by version, from platform.claude.com pricing (2026-10-25): 5.5 has its
// own row, 4.5 to 5 share one, and 4.1 and older keep the old price.
const OPUS_5_5: ModelPrice = { inputPerM: 4, outputPerM: 20, cacheReadPerM: 0.2, cacheWritePerM: 5 };
const OPUS_5: ModelPrice = { inputPerM: 5, outputPerM: 25, cacheReadPerM: 0.5, cacheWritePerM: 6.25 };
const OPUS_4: ModelPrice = { inputPerM: 15, outputPerM: 75, cacheReadPerM: 1.5, cacheWritePerM: 18.75 };
const SONNET: ModelPrice = { inputPerM: 3, outputPerM: 15, cacheReadPerM: 0.3, cacheWritePerM: 3.75 };
const HAIKU: ModelPrice = { inputPerM: 0.8, outputPerM: 4, cacheReadPerM: 0.08, cacheWritePerM: 1.0 };

// OpenAI list prices for the GPT-5 family Codex runs on. OpenAI bills no cache
// writes, and a cached input token costs a tenth of a fresh one. Newer point
// releases (gpt-5.x, gpt-5-codex) are priced as their family until listed here.
const GPT5: ModelPrice = { inputPerM: 1.25, outputPerM: 10, cacheReadPerM: 0.125, cacheWritePerM: 0 };
const GPT5_MINI: ModelPrice = { inputPerM: 0.25, outputPerM: 2, cacheReadPerM: 0.025, cacheWritePerM: 0 };
const GPT5_NANO: ModelPrice = { inputPerM: 0.05, outputPerM: 0.4, cacheReadPerM: 0.005, cacheWritePerM: 0 };

/** When the model id is unknown, assume Sonnet (the historical default). */
const DEFAULT_PRICE: ModelPrice = SONNET;

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
 * An Opus id's row by its version: `opus-5-5`, `opus-4-8-high` and `opus-4.8`
 * after the name, or `claude-3-opus` before it. Each part is one or two digits,
 * so a date such as the one in `claude-opus-4-20250514` is never read as one.
 * The bare `opus` alias, and any Opus newer than the table, get the newest row.
 */
function opusPrice(m: string): ModelPrice {
  const v = /opus-(\d{1,2})(?:[-.](\d{1,2}))?(?!\d)/.exec(m) ?? /(\d{1,2})(?:[-.](\d{1,2}))?-opus/.exec(m);
  if (!v) return OPUS_5_5;
  const version = Number(v[1]) + Number(v[2] ?? 0) / 10;
  if (version >= 5.5) return OPUS_5_5;
  return version >= 4.5 ? OPUS_5 : OPUS_4;
}

/** Resolve a model id to its price row by family, falling back to Sonnet. */
export function priceFor(model: string | undefined | null): ModelPrice {
  const m = normalizeModel(model).toLowerCase();
  if (m.includes('opus')) return opusPrice(m);
  if (m.includes('haiku')) return HAIKU;
  if (m.includes('sonnet')) return SONNET;
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
 */
export function estimateCostUsd(model: string | undefined | null, tokens: TokenSplit): number {
  const p = priceFor(model);
  return (
    (tokens.inputTokens / 1_000_000) * p.inputPerM +
    (tokens.outputTokens / 1_000_000) * p.outputPerM +
    (tokens.cacheReadTokens / 1_000_000) * p.cacheReadPerM +
    (tokens.cacheWriteTokens / 1_000_000) * p.cacheWritePerM
  );
}
