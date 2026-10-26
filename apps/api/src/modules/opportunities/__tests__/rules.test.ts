import { evaluateRole, matchPercent, rankMatches } from '../rules';

describe('matchPercent (BR-22)', () => {
  it('is verified ÷ required × 100 to two decimals', () => {
    expect(matchPercent(0, 3)).toBe(0);
    expect(matchPercent(1, 3)).toBe(33.33);
    expect(matchPercent(2, 3)).toBe(66.67);
    expect(matchPercent(3, 3)).toBe(100);
    expect(matchPercent(0, 0)).toBe(0);
  });
});

describe('evaluateRole (BRQ-13.2, 13.3)', () => {
  const role = [
    { code: 'wire', level: 3 },
    { code: 'SOLDER', level: 2 },
    { code: 'SAFE', level: 1 },
  ];
  it('counts a requirement only at or above its level; reports what is missing', () => {
    const r = evaluateRole(
      role,
      new Map([
        ['WIRE', 3],
        ['SOLDER', 1],
      ]),
    );
    expect(r).toEqual({
      verified: 1,
      required: 3,
      percent: 33.33,
      missing: [
        { code: 'SOLDER', requiredLevel: 2, verifiedLevel: 1 },
        { code: 'SAFE', requiredLevel: 1, verifiedLevel: null },
      ],
    });
  });

  it('a higher level than required still counts; codes ignore case', () => {
    const r = evaluateRole(
      role,
      new Map([
        ['WIRE', 4],
        ['SOLDER', 2],
        ['SAFE', 1],
      ]),
    );
    expect(r.percent).toBe(100);
    expect(r.missing).toEqual([]);
  });
});

describe('rankMatches', () => {
  it('orders by match, then the soonest closing, then title', () => {
    const ranked = rankMatches([
      { title: 'B', matchPercent: 50, closesOn: '2027-02-01' },
      { title: 'A', matchPercent: 100, closesOn: '2027-03-01' },
      { title: 'C', matchPercent: 50, closesOn: '2027-01-15' },
      { title: 'D', matchPercent: 50, closesOn: '2027-01-15' },
    ]);
    expect(ranked.map((r) => r.title)).toEqual(['A', 'C', 'D', 'B']);
  });
});
