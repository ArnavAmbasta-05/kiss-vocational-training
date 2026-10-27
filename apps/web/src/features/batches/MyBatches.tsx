import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { BatchSummary } from '@vtmp/shared';
import { Card, EmptyState, PageSkeleton, Spinner } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDay, formatSessionDate, formatSessionTime } from '../../lib/format';
import { useMyBatches } from './api';
import { BatchStatusBadge, FillBar } from './bits';

function NextSession({ batch }: { batch: BatchSummary }) {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const s = batch.nextSession;
  return (
    <div>
      <dt className="text-slate-600">{t('fields.nextSession')}</dt>
      <dd className="font-medium text-slate-900">
        {s ? (
          <>
            {formatSessionDate(s.startsAt, lng)}, {formatSessionTime(s.startsAt, s.endsAt, lng)}
            {s.topic && <span className="block text-sm font-normal text-slate-700">{s.topic}</span>}
          </>
        ) : (
          t('fields.noSession')
        )}
      </dd>
    </div>
  );
}

/** Trainer: assigned batches with roster size and next session (BR-05). */
export function TrainerBatchesPage() {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useMyBatches();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('mine.trainerTitle')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('mine.trainerIntro')}</p>
      </div>
      {isPending ? (
        <PageSkeleton />
      ) : isError ? (
        <EmptyState title={errorMessage(error)} />
      ) : data.length === 0 ? (
        <EmptyState title={t('mine.empty')} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {data.map((b) => (
            <li key={b.id}>
              <Card
                title={
                  <Link
                    to={`/trainer/batches/${b.id}`}
                    className="text-brand-800 underline hover:text-brand-900"
                  >
                    {`${b.courseTitle} · ${b.name}`}
                  </Link>
                }
                actions={<BatchStatusBadge status={b.status} />}
              >
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-600">{t('fields.dates')}</dt>
                    <dd className="font-medium text-slate-900">{`${formatDay(b.startDate, lng)} – ${formatDay(b.endDate, lng)}`}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">{t('fields.venue')}</dt>
                    <dd className="font-medium text-slate-900">{b.venue}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">{t('mine.roster')}</dt>
                    <dd>
                      <FillBar existing={b.enrolled} capacity={b.capacity} />
                    </dd>
                  </div>
                  <NextSession batch={b} />
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Student dashboard card: allocated batch, trainer, venue, next session. */
export function StudentBatchCard() {
  const { t } = useTranslation('batches');
  const { data, isPending } = useMyBatches();
  const b = data?.[0];

  return (
    <Card title={t('mine.studentCard')} headingLevel={2} data-testid="student-batch-card">
      {isPending ? (
        <Spinner />
      ) : !b ? (
        <p className="text-sm text-slate-700">{t('mine.noBatch')}</p>
      ) : (
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-600">{t('fields.course')}</dt>
            <dd className="font-medium text-slate-900">{`${b.courseTitle} · ${b.name}`}</dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('mine.trainer')}</dt>
            <dd className="font-medium text-slate-900">
              {b.trainers.map((tr) => tr.fullName).join(', ') || t('fields.noTrainer')}
            </dd>
          </div>
          <div>
            <dt className="text-slate-600">{t('fields.venue')}</dt>
            <dd className="font-medium text-slate-900">{b.venue}</dd>
          </div>
          <NextSession batch={b} />
        </dl>
      )}
    </Card>
  );
}
