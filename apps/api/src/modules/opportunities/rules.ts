export interface Requirement {
  code: string;
  level: number;
}

/** BR-22: verified required ÷ total required × 100, two decimals (0 when nothing is required). */
export function matchPercent(verified: number, required: number): number {
  if (required <= 0) return 0;
  return Math.round((verified * 10_000) / required) / 100;
}

/**
 * A role's requirements against the student's verified competencies (code → highest verified
 * level, codes compared case-insensitively). A requirement counts as verified only at or above
 * its level; anything else is missing, with the level reached so far (BRQ-13.2, 13.3).
 */
export function evaluateRole(
  requirements: readonly Requirement[],
  verifiedLevels: ReadonlyMap<string, number>,
): {
  verified: number;
  required: number;
  percent: number;
  missing: Array<{ code: string; requiredLevel: number; verifiedLevel: number | null }>;
} {
  const missing: Array<{ code: string; requiredLevel: number; verifiedLevel: number | null }> = [];
  let verified = 0;
  for (const r of requirements) {
    const have = verifiedLevels.get(r.code.toUpperCase()) ?? null;
    if (have !== null && have >= r.level) verified++;
    else missing.push({ code: r.code.toUpperCase(), requiredLevel: r.level, verifiedLevel: have });
  }
  return {
    verified,
    required: requirements.length,
    percent: matchPercent(verified, requirements.length),
    missing,
  };
}

/** Best match first; ties go to the opportunity closing soonest, then by title. */
export function rankMatches<T extends { matchPercent: number; closesOn: string; title: string }>(
  items: readonly T[],
): T[] {
  return [...items].sort(
    (a, b) =>
      b.matchPercent - a.matchPercent ||
      a.closesOn.localeCompare(b.closesOn) ||
      a.title.localeCompare(b.title),
  );
}
