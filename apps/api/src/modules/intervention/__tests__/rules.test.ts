import {
  flagStep,
  inTraining,
  riskLevel,
  runOrder,
  sameRisk,
  shouldEscalate,
  type RiskFacts,
} from '../rules';

const T = {
  mediumAttendanceBelow: 80,
  mediumConsecutiveAbsences: 3,
  mediumAssessmentBelow: 50,
  highAttendanceBelow: 75,
  highProjectedBelow: 40,
  highDropPoints: 15,
};

const facts = (over: Partial<RiskFacts> = {}): RiskFacts => ({
  attendancePercent: 100,
  consecutiveAbsences: 0,
  assessmentPercents: [],
  projectedAggregate: null,
  mandatoryGaps: [],
  ...over,
});

const codes = (f: RiskFacts) => riskLevel(f, T).reasons.map((r) => r.code);

describe('riskLevel: attendance boundaries (BR-16, BRD §9.3)', () => {
  it.each([
    [74.99, 'HIGH'],
    [75.0, 'MEDIUM'],
    [79.99, 'MEDIUM'],
    [80.0, 'LOW'],
  ])('%s %% attendance → %s', (percent, level) => {
    expect(riskLevel(facts({ attendancePercent: percent }), T).level).toBe(level);
  });

  it('reports only the High attendance reason below 75 %', () => {
    expect(codes(facts({ attendancePercent: 60 }))).toEqual(['ATTENDANCE_BELOW_HIGH']);
  });

  it('ignores attendance before any session is conducted', () => {
    expect(riskLevel(facts({ attendancePercent: null }), T).level).toBe('LOW');
  });
});

describe('riskLevel: other triggers', () => {
  it('2 consecutive absences are fine; 3 are Medium', () => {
    expect(riskLevel(facts({ consecutiveAbsences: 2 }), T).level).toBe('LOW');
    const r = riskLevel(facts({ consecutiveAbsences: 3 }), T);
    expect(r.level).toBe('MEDIUM');
    expect(r.reasons[0]).toMatchObject({ code: 'CONSECUTIVE_ABSENCES', actual: 3, threshold: 3 });
  });

  it('latest assessment below 50 % is Medium; exactly 50 % is not', () => {
    expect(riskLevel(facts({ assessmentPercents: [49.99] }), T).level).toBe('MEDIUM');
    expect(riskLevel(facts({ assessmentPercents: [50] }), T).level).toBe('LOW');
  });

  it('an old low mark no longer counts once the latest is fine', () => {
    expect(riskLevel(facts({ assessmentPercents: [30, 60] }), T).level).toBe('LOW');
  });

  it('a 15-point drop between consecutive assessments is High; 14.99 is not', () => {
    const r = riskLevel(facts({ assessmentPercents: [80, 65] }), T);
    expect(r.level).toBe('HIGH');
    expect(r.reasons).toEqual([{ code: 'SCORE_DROP', level: 'HIGH', actual: 15, threshold: 15 }]);
    expect(riskLevel(facts({ assessmentPercents: [80, 65.01] }), T).level).toBe('LOW');
  });

  it('projected aggregate below 40 % is High; exactly 40 % is not', () => {
    expect(riskLevel(facts({ projectedAggregate: 39.99 }), T).level).toBe('HIGH');
    expect(riskLevel(facts({ projectedAggregate: 40 }), T).level).toBe('LOW');
  });

  it('a gap on a mandatory competency is High (BR-18)', () => {
    const r = riskLevel(
      facts({ mandatoryGaps: [{ title: 'Wiring', requiredLevel: 3, gap: 1 }] }),
      T,
    );
    expect(r.level).toBe('HIGH');
    expect(r.reasons[0]).toMatchObject({ code: 'MANDATORY_GAP', competency: 'Wiring', actual: 1 });
  });

  it('reports every reason and takes the worst level', () => {
    const r = riskLevel(
      facts({ attendancePercent: 78, consecutiveAbsences: 4, projectedAggregate: 35 }),
      T,
    );
    expect(r.level).toBe('HIGH');
    expect(r.reasons.map((x) => x.code)).toEqual([
      'ATTENDANCE_BELOW_MEDIUM',
      'CONSECUTIVE_ABSENCES',
      'PROJECTED_BELOW',
    ]);
  });
});

describe('sameRisk', () => {
  it('ignores order but not figures', () => {
    const a = riskLevel(facts({ attendancePercent: 78, consecutiveAbsences: 3 }), T);
    const reversed = { level: a.level, reasons: [...a.reasons].reverse() };
    expect(sameRisk(a, reversed)).toBe(true);
    const b = riskLevel(facts({ attendancePercent: 77, consecutiveAbsences: 3 }), T);
    expect(sameRisk(a, b)).toBe(false);
  });
});

describe('flag lifecycle (BR-17)', () => {
  const now = new Date('2026-10-24T02:00:00Z');
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const medium = riskLevel(facts({ attendancePercent: 78 }), T);
  const low = riskLevel(facts(), T);

  it('opens a flag when at risk without one', () => {
    expect(flagStep(medium, null, now, 7)).toEqual({ kind: 'open' });
    expect(flagStep(low, null, now, 7)).toEqual({ kind: 'none' });
  });

  it('updates only when something changed, or when the risk returns while clearing', () => {
    expect(flagStep(medium, { ...medium, clearSince: null }, now, 7)).toEqual({ kind: 'none' });
    const high = riskLevel(facts({ attendancePercent: 70 }), T);
    expect(flagStep(high, { ...medium, clearSince: null }, now, 7)).toEqual({ kind: 'update' });
    expect(flagStep(medium, { ...medium, clearSince: days(2) }, now, 7)).toEqual({
      kind: 'update',
    });
  });

  it('starts the clear period, then closes after 7 clear days, not 6.99', () => {
    expect(flagStep(low, { ...medium, clearSince: null }, now, 7)).toEqual({ kind: 'clearing' });
    expect(flagStep(low, { ...medium, clearSince: days(6.99) }, now, 7)).toEqual({ kind: 'none' });
    expect(flagStep(low, { ...medium, clearSince: days(7) }, now, 7)).toEqual({ kind: 'close' });
  });

  it('escalates an unresolved High flag at 14 days, once', () => {
    const flag = {
      level: 'HIGH' as const,
      openedAt: days(14),
      escalatedAt: null,
      clearSince: null,
    };
    expect(shouldEscalate(flag, now, 14)).toBe(true);
    expect(shouldEscalate({ ...flag, openedAt: days(13.9) }, now, 14)).toBe(false);
    expect(shouldEscalate({ ...flag, escalatedAt: days(1) }, now, 14)).toBe(false);
    expect(shouldEscalate({ ...flag, level: 'MEDIUM' }, now, 14)).toBe(false);
    expect(shouldEscalate({ ...flag, clearSince: days(1) }, now, 14)).toBe(false);
  });
});

describe('runOrder (daily run catch-up)', () => {
  const fixed = () => 0.5;
  it('puts batches a partial run left over first, in their old order', () => {
    expect(runOrder(['a', 'b', 'c', 'd'], ['c', 'a'], fixed).slice(0, 2)).toEqual(['c', 'a']);
  });
  it('drops left-over ids that are no longer active and repeats nothing', () => {
    const order = runOrder(['a', 'b'], ['x', 'b', 'b'], fixed);
    expect(order[0]).toBe('b');
    expect([...order].sort()).toEqual(['a', 'b']);
  });
  it('visits every active batch exactly once with nothing left over', () => {
    expect(runOrder(['a', 'b', 'c'], [], Math.random).sort()).toEqual(['a', 'b', 'c']);
    expect(runOrder([], ['a'], Math.random)).toEqual([]);
  });
});

describe('inTraining (BR-16 scope)', () => {
  it('evaluates allocated and active students only', () => {
    expect(inTraining('ALLOCATED')).toBe(true);
    expect(inTraining('ACTIVE')).toBe(true);
    for (const s of ['COMPLETED', 'CERTIFIED', 'NOT_COMPLETED', 'WITHDRAWN', undefined]) {
      expect(inTraining(s)).toBe(false);
    }
  });
});
