import { addCounts, emptyCounts, figures, rate } from '../rules';

describe('rate', () => {
  it('is part ÷ whole × 100 to two decimals, null without a whole', () => {
    expect(rate(1, 3)).toBe(33.33);
    expect(rate(2, 3)).toBe(66.67);
    expect(rate(3, 3)).toBe(100);
    expect(rate(0, 0)).toBeNull();
  });
});

describe('outcome figures (BRQ-20.1, 20.3)', () => {
  const counts = {
    ...emptyCounts(),
    students: 10,
    completed: 6,
    notCompleted: 2,
    certified: 5,
    marksTotal: 40,
    marksPresent: 28,
    marksLate: 4,
    scoreSum: 72.5 + 60 + 90,
    scoreCount: 3,
    placed: 3,
  };

  it('completion counts finished students only; placement is per completed student', () => {
    const f = figures(counts, true);
    expect(f.completionRate).toBe(75); // 6 of 8 finished
    expect(f.placementRate).toBe(50); // 3 of 6 completed
  });

  it('attendance follows the LATE setting (BR-08)', () => {
    expect(figures(counts, true).attendanceRate).toBe(80); // (28 + 4) / 40
    expect(figures(counts, false).attendanceRate).toBe(70); // 28 / 40
  });

  it('average score is the mean result percentage', () => {
    expect(figures(counts, true).averageScore).toBe(74.17);
  });

  it('is null, not 0 %, before there is anything to measure', () => {
    const f = figures({ ...emptyCounts(), students: 4 }, true);
    expect(f).toMatchObject({
      completionRate: null,
      averageScore: null,
      attendanceRate: null,
      placementRate: null,
    });
  });

  it('adds batch counts into course totals', () => {
    const sum = addCounts(counts, { ...emptyCounts(), students: 5, completed: 2, notCompleted: 0 });
    expect(sum).toMatchObject({ students: 15, completed: 8, notCompleted: 2 });
    expect(figures(sum, true).completionRate).toBe(80);
  });
});
