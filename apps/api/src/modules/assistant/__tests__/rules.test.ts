import { chunkText, costUsd, estimateTokens, guard, relevantEnough } from '../rules';

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ');

describe('chunkText (ADR-09: ~500 tokens, 50 overlap)', () => {
  it('splits into ~500-token excerpts that overlap by ~50 tokens', () => {
    const chunks = chunkText(words(1000), 500, 50);
    // 500 tokens ≈ 375 words; 50 ≈ 37 words of overlap; step 338 words.
    expect(chunks.map((c) => c.split(' ').length)).toEqual([375, 375, 324]);
    const first = chunks[0]!.split(' ');
    const second = chunks[1]!.split(' ');
    expect(second.slice(0, 37)).toEqual(first.slice(-37));
    expect(chunks.every((c) => estimateTokens(c) <= 500)).toBe(true);
  });

  it('keeps short text in one chunk and ignores whitespace-only text', () => {
    expect(chunkText('  Safety   first.\n\nAlways isolate. ', 500, 50)).toEqual([
      'Safety first. Always isolate.',
    ]);
    expect(chunkText(' \n ', 500, 50)).toEqual([]);
  });
});

describe('guard (BRQ-17.5, NFR-13)', () => {
  const ok = { enabled: true, usedToday: 3, dailyLimit: 30, monthCostUsd: 1, monthlyCapUsd: 5 };
  it('checks the flag, then the daily limit, then the monthly cap', () => {
    expect(guard(ok)).toBeNull();
    expect(guard({ ...ok, enabled: false, usedToday: 99 })).toBe('DISABLED');
    expect(guard({ ...ok, usedToday: 30 })).toBe('DAILY_LIMIT');
    expect(guard({ ...ok, usedToday: 29 })).toBeNull();
    expect(guard({ ...ok, monthCostUsd: 5 })).toBe('BUDGET_REACHED');
    expect(guard({ ...ok, monthlyCapUsd: 0, monthCostUsd: 0 })).toBe('BUDGET_REACHED');
  });
});

describe('relevantEnough (BR-21)', () => {
  it('needs a best excerpt at or above the threshold', () => {
    expect(relevantEnough(null, 0.4)).toBe(false);
    expect(relevantEnough(0.39, 0.4)).toBe(false);
    expect(relevantEnough(0.4, 0.4)).toBe(true);
  });
});

describe('costUsd', () => {
  it('prices input and output tokens per million', () => {
    expect(
      costUsd({ inputTokens: 2000, outputTokens: 500 }, { inputPerMTok: 0.1, outputPerMTok: 0.5 }),
    ).toBe(0.00045);
  });
});
