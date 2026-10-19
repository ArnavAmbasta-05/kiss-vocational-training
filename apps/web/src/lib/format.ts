/** Locale-aware formatting through Intl (NFR-11): no hand-written date or number strings. */

export function formatDate(iso: string, lng: string, withTime = false): string {
  return new Intl.DateTimeFormat(lng, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(iso));
}

/**
 * Training happens at the institute, so session times are always shown in its time zone
 * (IST, matching the server setting institution.utcOffsetMinutes = 330), wherever the viewer is.
 */
export const INSTITUTION_TIME_ZONE = 'Asia/Kolkata';

export function formatSessionDate(iso: string, lng: string): string {
  return new Intl.DateTimeFormat(lng, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: INSTITUTION_TIME_ZONE,
  }).format(new Date(iso));
}

export function formatSessionTime(startIso: string, endIso: string, lng: string): string {
  const f = new Intl.DateTimeFormat(lng, { timeStyle: 'short', timeZone: INSTITUTION_TIME_ZONE });
  return `${f.format(new Date(startIso))} – ${f.format(new Date(endIso))}`;
}

/** YYYY-MM-DD of an instant in the institution's time zone (for grouping by day). */
export function institutionDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: INSTITUTION_TIME_ZONE }).format(
    new Date(iso),
  );
}

/** Converts a local date + HH:MM at the institution (IST) into an ISO instant. */
export function institutionInstant(day: string, hhmm: string): string {
  return new Date(`${day}T${hhmm}:00+05:30`).toISOString();
}

/** Calendar date (YYYY-MM-DD) without shifting it through the viewer's time zone. */
export function formatDay(day: string, lng: string): string {
  return new Intl.DateTimeFormat(lng, { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "in 3 days", "2 hours ago", in the user's language. */
export function relativeTime(iso: string, lng: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const rtf = new Intl.RelativeTimeFormat(lng, { numeric: 'auto' });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diff) >= ms || unit === 'minute') return rtf.format(Math.round(diff / ms), unit);
  }
  return rtf.format(0, 'minute');
}

/** Value for <input type="datetime-local"> in the viewer's local time. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a datetime-local value (local time) into an ISO string. */
export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
