/** Locale-aware formatting through Intl (NFR-11): no hand-written date or number strings. */

export function formatDate(iso: string, lng: string, withTime = false): string {
  return new Intl.DateTimeFormat(lng, {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(new Date(iso));
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
