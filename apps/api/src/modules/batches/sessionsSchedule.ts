import { DAYS_OF_WEEK, type DayOfWeek } from '@vtmp/shared';

export interface RecurringPlan {
  daysOfWeek: readonly DayOfWeek[];
  /** HH:MM in institution local time. */
  startTime: string;
  endTime: string;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  until: string;
}

/** Hard ceiling so a typo (e.g. until 2099) cannot create thousands of rows. */
export const MAX_GENERATED_SESSIONS = 200;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h! * 60 + m!;
}

/**
 * Expands a weekly plan into concrete sessions (pure). Times are institution local time at a
 * fixed UTC offset (IST has no daylight saving), converted to UTC instants for storage.
 */
export function expandRecurring(
  plan: RecurringPlan,
  utcOffsetMinutes: number,
): Array<{ startsAt: Date; endsAt: Date }> {
  const startMin = minutes(plan.startTime);
  const endMin = minutes(plan.endTime);
  if (endMin <= startMin) throw new Error('END_BEFORE_START');
  const wanted = new Set(plan.daysOfWeek.map((d) => DAYS_OF_WEEK.indexOf(d)));

  const out: Array<{ startsAt: Date; endsAt: Date }> = [];
  const day = new Date(`${plan.from}T00:00:00Z`);
  const last = new Date(`${plan.until}T00:00:00Z`);
  while (day <= last) {
    if (wanted.has(day.getUTCDay())) {
      // Local midnight of this calendar day expressed in UTC, plus the local clock time.
      const base = day.getTime() - utcOffsetMinutes * 60_000;
      out.push({
        startsAt: new Date(base + startMin * 60_000),
        endsAt: new Date(base + endMin * 60_000),
      });
      if (out.length > MAX_GENERATED_SESSIONS) throw new Error('TOO_MANY_SESSIONS');
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}
