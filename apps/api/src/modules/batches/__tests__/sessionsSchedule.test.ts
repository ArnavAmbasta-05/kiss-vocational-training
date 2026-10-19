import { expandRecurring, MAX_GENERATED_SESSIONS } from '../sessionsSchedule';

describe('expandRecurring', () => {
  it('creates Mon/Wed 10:00–12:00 IST sessions as UTC instants', () => {
    // 2027-01-04 is a Monday.
    const out = expandRecurring(
      {
        daysOfWeek: ['MON', 'WED'],
        startTime: '10:00',
        endTime: '12:00',
        from: '2027-01-04',
        until: '2027-01-13',
      },
      330,
    );
    expect(out.map((s) => s.startsAt.toISOString())).toEqual([
      '2027-01-04T04:30:00.000Z',
      '2027-01-06T04:30:00.000Z',
      '2027-01-11T04:30:00.000Z',
      '2027-01-13T04:30:00.000Z',
    ]);
    expect(out[0]!.endsAt.toISOString()).toBe('2027-01-04T06:30:00.000Z');
  });

  it('includes both end dates and handles an early-morning local time crossing UTC midnight', () => {
    const out = expandRecurring(
      {
        daysOfWeek: ['TUE'],
        startTime: '04:00',
        endTime: '05:00',
        from: '2027-01-05',
        until: '2027-01-05',
      },
      330,
    );
    // 04:00 IST on Tue 5 Jan = 22:30 UTC on Mon 4 Jan.
    expect(out.map((s) => s.startsAt.toISOString())).toEqual(['2027-01-04T22:30:00.000Z']);
  });

  it('rejects end before start and runaway schedules', () => {
    expect(() =>
      expandRecurring(
        {
          daysOfWeek: ['MON'],
          startTime: '12:00',
          endTime: '10:00',
          from: '2027-01-04',
          until: '2027-01-04',
        },
        330,
      ),
    ).toThrow('END_BEFORE_START');
    expect(() =>
      expandRecurring(
        {
          daysOfWeek: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'],
          startTime: '09:00',
          endTime: '10:00',
          from: '2027-01-01',
          until: '2027-12-31',
        },
        330,
      ),
    ).toThrow('TOO_MANY_SESSIONS');
    expect(MAX_GENERATED_SESSIONS).toBe(200);
  });
});
