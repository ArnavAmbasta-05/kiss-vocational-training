import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { canVerify, demonstrated, gap, provisionalLevel } from '../rules';

const bands = { L2: 40, L3: 60, L4: 85 };

describe('provisional level from linked assessments', () => {
  it.each([
    [0, 1],
    [39.99, 1],
    [40, 2],
    [59.99, 2],
    [60, 3],
    [84.99, 3],
    [85, 4],
    [100, 4],
  ])('%p %% → level %p', (percent, level) => {
    expect(provisionalLevel(percent, bands)).toBe(level);
  });
});

describe('demonstrated level', () => {
  it("prefers the trainer's rating over assessment results", () => {
    expect(demonstrated(2, [95], bands)).toEqual({ level: 2, source: 'RATING' });
  });
  it('falls back to the average of linked results, marked provisional', () => {
    expect(demonstrated(null, [50, 80], bands)).toEqual({ level: 3, source: 'PROVISIONAL' });
  });
  it('is not assessed with neither', () => {
    expect(demonstrated(null, [], bands)).toEqual({ level: null, source: 'NOT_ASSESSED' });
  });
});

describe('gap (BR-18)', () => {
  it('is 0 at the required level and never negative', () => {
    expect(gap(3, 3)).toBe(0);
    expect(gap(3, 4)).toBe(0);
  });
  it('is 1 one level below', () => {
    expect(gap(3, 2)).toBe(1);
  });
  it('BRD acceptance: level 1 on a level-3 competency is a gap of 2', () => {
    expect(gap(3, 1)).toBe(2);
  });
  it('not assessed counts as the full required level', () => {
    expect(gap(3, null)).toBe(3);
  });
});

describe('verification (BR-13)', () => {
  it('is allowed only at or above the required level', () => {
    expect(canVerify(2, 3)).toBe(false);
    expect(canVerify(3, 3)).toBe(true);
    expect(canVerify(4, 3)).toBe(true);
  });
});

/** CLAUDE.md rule 5: innovation modules may import core, never the other way round. */
describe('module boundaries', () => {
  const INNOVATION = [
    'competency',
    'passport',
    'intervention',
    'verification',
    'opportunities',
    'scheduling-advisor',
    'evidence',
    'assistant',
    'analytics',
  ];
  const modulesDir = path.resolve(__dirname, '../..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
    });

  it('no core module imports an innovation module', () => {
    const core = readdirSync(modulesDir).filter(
      (m) => !INNOVATION.includes(m) && statSync(path.join(modulesDir, m)).isDirectory(),
    );
    const offenders = core.flatMap((m) =>
      files(path.join(modulesDir, m)).filter((f) =>
        INNOVATION.some((i) =>
          new RegExp(`from ['"](\\.\\./)+${i}/`).test(readFileSync(f, 'utf8')),
        ),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
