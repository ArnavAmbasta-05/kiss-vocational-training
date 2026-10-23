import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CertificateDto } from '@vtmp/shared';
import { Button, Card, EmptyState, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { useMyEnrollments } from '../enrollment/api';
import { downloadCertificate, useMyCertificates } from './api';

function CertificateCard({ c, headingLevel = 2 }: { c: CertificateDto; headingLevel?: 2 | 3 }) {
  const { t, i18n } = useTranslation('completion');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = useState(false);

  const onDownload = async () => {
    setBusy(true);
    try {
      await downloadCertificate(c.id, c.publicCode);
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={t('mine.certificateFor', { course: c.courseTitle, batch: c.batchName })}
      headingLevel={headingLevel}
      data-testid="certificate-card"
    >
      <p className="text-lg font-semibold text-slate-900">{t('mine.grade', { grade: c.grade })}</p>
      <p className="text-sm text-slate-700">
        {t('mine.figures', {
          aggregate: c.aggregatePercent.toFixed(2),
          attendance: c.attendancePercent.toFixed(2),
        })}
      </p>
      <p className="mt-2 font-mono text-sm text-slate-800">
        {t('mine.code', { code: c.publicCode })}
      </p>
      <p className="text-xs text-slate-600">
        {t('mine.issued', { date: formatDate(c.issuedAt, lng) })}
      </p>
      <div className="mt-3">
        {c.rendered ? (
          <Button onClick={() => void onDownload()} loading={busy}>
            {t('mine.download')}
          </Button>
        ) : (
          <p className="text-sm text-slate-700">{t('mine.preparing')}</p>
        )}
      </div>
    </Card>
  );
}

/** Student dashboard card: the newest certificate, once there is one. */
export function StudentCertificateCard() {
  const { data } = useMyCertificates();
  const latest = data?.find((c) => c.status === 'VALID');
  return latest ? <CertificateCard c={latest} /> : null;
}

/** Student: certificates with download, and the reason if training was not completed. */
export function MyCertificatesPage() {
  const { t } = useTranslation('completion');
  const errorMessage = useErrorMessage();
  const certificates = useMyCertificates();
  const enrollments = useMyEnrollments();
  const notCompleted = (enrollments.data ?? []).filter((e) => e.status === 'NOT_COMPLETED');

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('mine.title')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('mine.intro')}</p>
      </div>
      {notCompleted.map((e) => (
        <div
          key={e.id}
          role="status"
          className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-semibold">{t('mine.notCompleted')}</p>
          <p>{t('mine.notCompletedBody', { cycle: e.cycleName, reason: e.reason ?? '' })}</p>
        </div>
      ))}
      {certificates.isPending ? (
        <Spinner />
      ) : certificates.isError ? (
        <EmptyState title={errorMessage(certificates.error)} />
      ) : certificates.data.length === 0 ? (
        <EmptyState title={t('mine.none')} />
      ) : (
        certificates.data.map((c) => <CertificateCard key={c.id} c={c} />)
      )}
    </div>
  );
}
