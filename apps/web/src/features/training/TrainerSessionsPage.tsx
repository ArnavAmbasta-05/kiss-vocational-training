import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, EmptyState, Spinner } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatSessionDate, formatSessionTime, institutionDay } from '../../lib/format';
import { useMySessions, type MySession } from './api';

/** Trainer: sessions around today with one click into attendance (NFR-04). */
export function TrainerSessionsPage() {
  const { t, i18n } = useTranslation(['training', 'batches']);
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useMySessions();

  if (isPending) return <Spinner size="lg" />;
  if (isError) return <EmptyState title={errorMessage(error)} />;

  const today = institutionDay(new Date().toISOString());
  const groups: Array<[string, MySession[]]> = [
    ['today', data.filter((s) => institutionDay(s.startsAt) === today)],
    ['upcoming', data.filter((s) => institutionDay(s.startsAt) > today)],
    ['past', data.filter((s) => institutionDay(s.startsAt) < today).reverse()],
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('sessions.title')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('sessions.intro')}</p>
      </div>
      {data.length === 0 && <EmptyState title={t('sessions.empty')} />}
      {groups.map(([key, items]) =>
        items.length === 0 ? null : (
          <section key={key} aria-labelledby={`sessions-${key}`}>
            <h2 id={`sessions-${key}`} className="mb-2 text-lg font-semibold text-slate-900">
              {t(`sessions.${key}`)}
            </h2>
            <ul className="flex flex-col gap-2">
              {items.map((s) => {
                const started = new Date(s.startsAt) <= new Date();
                const when = `${formatSessionDate(s.startsAt, lng)} ${formatSessionTime(s.startsAt, s.endsAt, lng)}`;
                const batch = `${s.courseTitle} · ${s.batchName}`;
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{batch}</p>
                      <p className="text-sm text-slate-700">
                        {when} · {s.venue}
                        {s.topic ? ` · ${s.topic}` : ''}
                      </p>
                      <p className="text-xs text-slate-600">
                        {t('sessions.marked', { marked: s.marked, total: s.rosterSize })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          s.status === 'CONDUCTED'
                            ? 'success'
                            : s.status === 'CANCELLED'
                              ? 'neutral'
                              : 'info'
                        }
                      >
                        {t(`batches:session.${s.status}`)}
                      </Badge>
                      {started && s.status !== 'CANCELLED' && (
                        <Link
                          to={`/trainer/sessions/${s.id}`}
                          aria-label={t(s.marked ? 'sessions.viewFor' : 'sessions.takeFor', {
                            batch,
                            when,
                          })}
                          className="inline-flex h-9 items-center rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                        >
                          {s.marked ? t('sessions.view') : t('sessions.take')}
                        </Link>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ),
      )}
    </div>
  );
}
