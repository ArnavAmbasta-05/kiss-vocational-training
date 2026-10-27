import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { INACTIVE_ENROLLMENT_STATUSES, type MyEnrollment } from '@vtmp/shared';
import { Button, Card, EmptyState, Modal, PageSkeleton } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { useMyEnrollments, useWithdrawEnrollment } from './api';
import { StatusBadge } from './StatusBadge';

const buttonLink =
  'inline-flex h-10 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2';

/** Student's applications with status, reason and timeline (BRQ-3.4). */
export function MyEnrollmentPage() {
  const { t } = useTranslation('enrollment');
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useMyEnrollments();

  if (isPending) return <PageSkeleton />;
  if (isError) return <EmptyState title={errorMessage(error)} />;

  const hasActive = data.some((e) => !INACTIVE_ENROLLMENT_STATUSES.includes(e.status));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('mine.title')}</h1>
          <p className="mt-1 text-sm text-slate-700">{t('mine.intro')}</p>
        </div>
        {data.length > 0 && !hasActive && (
          <Link to="/student/courses" className={buttonLink}>
            {t('mine.applyAgain')}
          </Link>
        )}
      </div>
      {data.length === 0 ? (
        <EmptyState
          title={t('mine.none')}
          action={
            <Link to="/student/courses" className={buttonLink}>
              {t('mine.browse')}
            </Link>
          }
        />
      ) : (
        data.map((e) => <EnrollmentCard key={e.id} enrollment={e} />)
      )}
    </div>
  );
}

function EnrollmentCard({ enrollment: e }: { enrollment: MyEnrollment }) {
  const { t, i18n } = useTranslation('enrollment');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const withdraw = useWithdrawEnrollment();
  const [confirming, setConfirming] = useState(false);

  const onWithdraw = async () => {
    try {
      await withdraw.mutateAsync(e.id);
      toast.show({ tone: 'success', title: t('mine.withdrawn') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Card
      title={e.cycleName}
      actions={<StatusBadge status={e.status} />}
      data-testid="enrollment-card"
    >
      <p className="text-sm text-slate-600">
        {t('mine.submittedOn', { when: formatDate(e.submittedAt, lng, true) })}
      </p>
      {e.reason && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-800">
          <span className="font-medium">{t('mine.reason')}:</span> {e.reason}
        </p>
      )}

      <h3 className="mt-4 text-sm font-semibold text-slate-900">{t('mine.preferences')}</h3>
      <ol className="mt-2 flex flex-col gap-1 text-sm text-slate-800">
        {e.preferences.map((p) => (
          <li key={p.courseId}>
            {t('apply.rank', { rank: p.rank })}:{' '}
            <span className="font-medium">{p.courseTitle}</span>{' '}
            <span className="text-slate-600">({p.courseCode})</span>
          </li>
        ))}
      </ol>

      <h3 className="mt-4 text-sm font-semibold text-slate-900">{t('mine.timeline')}</h3>
      <ol className="mt-2 border-l-2 border-slate-200 pl-4">
        {e.history.map((h, i) => (
          <li key={i} className="relative pb-3 last:pb-0">
            <span
              aria-hidden="true"
              className="absolute -left-[1.4rem] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-600"
            />
            <p className="text-sm font-medium text-slate-900">{t(`status.${h.status}`)}</p>
            <p className="text-xs text-slate-600">{formatDate(h.at, lng, true)}</p>
            {h.reason && <p className="text-sm text-slate-700">{h.reason}</p>}
          </li>
        ))}
      </ol>

      {e.editable ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to={`/student/enrollment/apply?edit=${e.id}&cycle=${e.cycleId}`}
            className="inline-flex h-10 items-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          >
            {t('mine.edit')}
          </Link>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('mine.withdraw')}
          </Button>
        </div>
      ) : (
        e.status === 'PENDING' && (
          <p className="mt-4 text-xs text-slate-600">{t('mine.lockedHint')}</p>
        )
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('mine.withdrawTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('admin.cancel')}
            </Button>
            <Button variant="danger" loading={withdraw.isPending} onClick={() => void onWithdraw()}>
              {t('mine.withdrawConfirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">{t('mine.withdrawBody')}</p>
      </Modal>
    </Card>
  );
}
