/** Roughly 1.33 tokens per word in English; good enough for sizing excerpts (ADR-09). */
const TOKENS_PER_WORD = 4 / 3;

export function estimateTokens(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * TOKENS_PER_WORD);
}

/**
 * Splits material text into ~`maxTokens` excerpts that repeat the last `overlapTokens` of the
 * previous one, so an answer that spans a boundary is still found. Splits on words and keeps
 * whitespace normalised; empty text gives no chunks.
 */
export function chunkText(text: string, maxTokens: number, overlapTokens: number): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length === 0) return [];
  const size = Math.max(1, Math.floor(maxTokens / TOKENS_PER_WORD));
  const overlap = Math.min(size - 1, Math.max(0, Math.floor(overlapTokens / TOKENS_PER_WORD)));
  const step = size - overlap;
  const chunks: string[] = [];
  for (let start = 0; start < words.length; start += step) {
    chunks.push(words.slice(start, start + size).join(' '));
    if (start + size >= words.length) break;
  }
  return chunks;
}

export type GuardResult = null | 'DISABLED' | 'DAILY_LIMIT' | 'BUDGET_REACHED';

/**
 * BRQ-17.5 / NFR-13: the checks before any embedding or model call, cheapest first. The monthly
 * cap is in US dollars; a cap of 0 allows no spending at all.
 */
export function guard(s: {
  enabled: boolean;
  usedToday: number;
  dailyLimit: number;
  monthCostUsd: number;
  monthlyCapUsd: number;
}): GuardResult {
  if (!s.enabled) return 'DISABLED';
  if (s.usedToday >= s.dailyLimit) return 'DAILY_LIMIT';
  if (s.monthCostUsd >= s.monthlyCapUsd) return 'BUDGET_REACHED';
  return null;
}

/** BR-21: answer only when the best excerpt is similar enough; otherwise decline, no model call. */
export function relevantEnough(bestSimilarity: number | null, minSimilarity: number): boolean {
  return bestSimilarity !== null && bestSimilarity >= minSimilarity;
}

/** Model cost in US dollars from token counts and per-million-token prices. */
export function costUsd(
  usage: { inputTokens: number; outputTokens: number },
  price: { inputPerMTok: number; outputPerMTok: number },
): number {
  const cost =
    (usage.inputTokens * price.inputPerMTok + usage.outputTokens * price.outputPerMTok) / 1e6;
  return Math.round(cost * 1e6) / 1e6;
}
