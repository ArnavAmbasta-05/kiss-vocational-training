import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SessionDto } from '@vtmp/shared';
import { Badge, Button, EmptyState, cn } from '../../components/ui';
import {
  INSTITUTION_TIME_ZONE,
  formatSessionDate,
  formatSessionTime,
  institutionDay,
} from '../../lib/format';

/** Sessions as a list grouped by day, or as a month calendar. */
export function SessionsView({
  sessions,
  onCancel,
}: {
  sessions: SessionDto[];
  /** When given, scheduled sessions get a cancel button (admin). */
  onCancel?: (s: SessionDto) => void;
}) {
  const { t } = useTranslation('batches');
  const [mode, setMode] = useState<'list' | 'calendar'>('list');

  if (sessions.length === 0) return <EmptyState title={t('sessions.empty')} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-600">{t('sessions.timeZoneNote')}</p>
        <div
          role="group"
          aria-label={t('sessions.view')}
          className="inline-flex rounded-md border border-slate-300"
        >
          {(['list', 'calendar'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                'px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                mode === m ? 'bg-brand-700 text-white' : 'text-slate-700 hover:bg-slate-50',
              )}
            >
              {t(`sessions.${m}`)}
            </button>
          ))}
        </div>
      </div>
      {mode === 'list' ? (
        <SessionList sessions={sessions} onCancel={onCancel} />
      ) : (
        <SessionCalendar sessions={sessions} />
      )}
    </div>
  );
}

function SessionList({
  sessions,
  onCancel,
}: {
  sessions: SessionDto[];
  onCancel?: (s: SessionDto) => void;
}) {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const byDay = useMemo(() => {
    const groups = new Map<string, SessionDto[]>();
    for (const s of sessions) {
      const d = institutionDay(s.startsAt);
      groups.set(d, [...(groups.get(d) ?? []), s]);
    }
    return [...groups.entries()];
  }, [sessions]);

  return (
    <ul className="flex flex-col gap-3" aria-label={t('sessions.caption')}>
      {byDay.map(([day, items]) => (
        <li key={day}>
          <h3 className="text-sm font-semibold text-slate-900">
            {formatSessionDate(items[0]!.startsAt, lng)}
          </h3>
          <ul className="mt-1 flex flex-col gap-1">
            {items.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-slate-900">
                  {formatSessionTime(s.startsAt, s.endsAt, lng)}
                </span>
                <span className="text-slate-700">{s.topic ?? ''}</span>
                <span className="text-slate-600">{s.venue}</span>
                {s.trainerName && <span className="text-slate-600">{s.trainerName}</span>}
                <Badge
                  tone={
                    s.status === 'CANCELLED'
                      ? 'neutral'
                      : s.status === 'CONDUCTED'
                        ? 'success'
                        : 'info'
                  }
                >
                  {t(`session.${s.status}`)}
                </Badge>
                {onCancel && s.status === 'SCHEDULED' && new Date(s.startsAt) > new Date() && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => onCancel(s)}
                    aria-label={t('sessions.cancelFor', {
                      when: `${formatSessionDate(s.startsAt, lng)} ${formatSessionTime(s.startsAt, s.endsAt, lng)}`,
                    })}
                  >
                    {t('sessions.cancel')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function SessionCalendar({ sessions }: { sessions: SessionDto[] }) {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const firstDay = institutionDay(
    sessions.find((s) => new Date(s.endsAt) >= new Date())?.startsAt ?? sessions[0]!.startsAt,
  );
  const [month, setMonth] = useState(firstDay.slice(0, 7));

  const counts = useMemo(() => {
    const m = new Map<string, SessionDto[]>();
    for (const s of sessions) {
      const d = institutionDay(s.startsAt);
      m.set(d, [...(m.get(d) ?? []), s]);
    }
    return m;
  }, [sessions]);

  const [y, mo] = month.split('-').map(Number) as [number, number];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells = [
    ...Array(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  const shift = (by: number) => {
    const d = new Date(Date.UTC(y, mo - 1 + by, 1));
    setMonth(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  };
  const weekday = new Intl.DateTimeFormat(lng, { weekday: 'short', timeZone: 'UTC' });
  const monthLabel = new Intl.DateTimeFormat(lng, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(first);
  const time = new Intl.DateTimeFormat(lng, {
    timeStyle: 'short',
    timeZone: INSTITUTION_TIME_ZONE,
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => shift(-1)}
          aria-label={t('sessions.previousMonth')}
        >
          <span aria-hidden="true">‹</span>
        </Button>
        <h3 className="text-sm font-semibold text-slate-900" aria-live="polite">
          {monthLabel}
        </h3>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => shift(1)}
          aria-label={t('sessions.nextMonth')}
        >
          <span aria-hidden="true">›</span>
        </Button>
      </div>
      <table className="w-full table-fixed border-collapse text-xs">
        <caption className="sr-only">{`${t('sessions.caption')}: ${monthLabel}`}</caption>
        <thead>
          <tr>
            {Array.from({ length: 7 }, (_, i) => (
              <th key={i} scope="col" className="py-1 font-medium text-slate-600">
                {weekday.format(new Date(Date.UTC(2027, 0, 3 + i)))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: Math.ceil(cells.length / 7) }, (_, w) => (
            <tr key={w}>
              {cells
                .slice(w * 7, w * 7 + 7)
                .concat(Array<null>(7).fill(null))
                .slice(0, 7)
                .map((d, i) => {
                  const key = d ? `${month}-${String(d).padStart(2, '0')}` : '';
                  const items: SessionDto[] = (d ? counts.get(key) : undefined) ?? [];
                  return (
                    <td key={i} className="h-16 border border-slate-100 p-1 align-top">
                      {d && (
                        <>
                          <span className="text-slate-700">{d}</span>
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {items.map((s) => (
                              <li
                                key={s.id}
                                className={cn(
                                  'truncate rounded px-1',
                                  s.status === 'CANCELLED'
                                    ? 'bg-slate-100 text-slate-600 line-through'
                                    : 'bg-brand-50 text-brand-900',
                                )}
                              >
                                {time.format(new Date(s.startsAt))}
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </td>
                  );
                })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
