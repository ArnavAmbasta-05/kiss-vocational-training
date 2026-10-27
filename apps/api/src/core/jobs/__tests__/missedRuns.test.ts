import { missedRuns } from '..';

const DAY = 86_400_000;
const now = new Date('2026-10-26T21:00:00Z');
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('missedRuns', () => {
  it('is 0 for a job that never ran or ran on schedule', () => {
    expect(missedRuns(null, now, DAY)).toBe(0);
    expect(missedRuns(ago(DAY), now, DAY)).toBe(0);
  });
  it('tolerates a cron that fires within the hour, early or late', () => {
    expect(missedRuns(ago(DAY - 50 * 60_000), now, DAY)).toBe(0);
    expect(missedRuns(ago(DAY + 50 * 60_000), now, DAY)).toBe(0);
  });
  it('counts whole missed days', () => {
    expect(missedRuns(ago(2 * DAY), now, DAY)).toBe(1);
    expect(missedRuns(ago(3 * DAY + 30 * 60_000), now, DAY)).toBe(2);
  });
});
