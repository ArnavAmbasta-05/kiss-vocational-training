import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RosterEntry } from '@vtmp/shared';
import { Button, Card, EmptyState, Select, Spinner, Table, type Column } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAdminCourses, useAdminCycles } from '../admin-courses/api';
import { useAdminBatches, useBatch } from '../batches/api';
import { StatusBadge } from '../enrollment/StatusBadge';
import { downloadBatchReport, downloadCourseReport, downloadStudentReport } from './api';
import { ReportButtons } from './ReportButtons';

/** Admin: batch, course and student reports (BRQ-8.1, BRQ-8.2). */
export function ReportsPage() {
  const { t } = useTranslation('reports');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('intro')}</p>
      </div>
      <BatchReports />
      <CourseReports />
    </div>
  );
}

function BatchReports() {
  const { t } = useTranslation('reports');
  const cycles = useAdminCycles();
  const [cycleId, setCycleId] = useState<string>();
  const [batchId, setBatchId] = useState('');
  const batches = useAdminBatches({ cycleId });

  useEffect(() => {
    if (!cycleId && cycles.data?.[0]) setCycleId(cycles.data[0].id);
  }, [cycleId, cycles.data]);

  const options = (batches.data ?? []).filter((b) => b.status !== 'PLANNED');
  const chosen = options.find((b) => b.id === batchId);

  return (
    <Card title={t('batch.heading')} headingLevel={2}>
      <p className="-mt-2 mb-4 text-sm text-slate-600">{t('batch.desc')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Select
            label={t('batch.cycle')}
            value={cycleId ?? ''}
            onChange={(e) => {
              setCycleId(e.target.value);
              setBatchId('');
            }}
            options={(cycles.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <div className="w-80 max-w-full">
          <Select
            label={t('batch.batch')}
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            options={[
              { value: '', label: t('batch.choose') },
              ...options.map((b) => ({ value: b.id, label: `${b.courseTitle} · ${b.name}` })),
            ]}
          />
        </div>
        {chosen && (
          <ReportButtons
            name={`${chosen.courseTitle} · ${chosen.name}`}
            download={(format) =>
              downloadBatchReport(chosen.id, `${chosen.courseCode}-${chosen.name}`, format)
            }
          />
        )}
      </div>
      {chosen && <StudentReports batchId={chosen.id} />}
    </Card>
  );
}

/** Per-student performance reports for the chosen batch. */
function StudentReports({ batchId }: { batchId: string }) {
  const { t } = useTranslation('reports');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const batch = useBatch(batchId);
  const [busy, setBusy] = useState<string | null>(null);

  if (batch.isPending) return <Spinner />;
  if (batch.isError) return <EmptyState title={errorMessage(batch.error)} />;

  const download = async (r: RosterEntry) => {
    setBusy(r.enrollmentId);
    try {
      await downloadStudentReport(r.studentId, r.rollNo, r.enrollmentId);
    } catch (err) {
      toast.show({ tone: 'error', title: `${t('failed')}: ${errorMessage(err)}` });
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<RosterEntry>[] = [
    {
      key: 'student',
      header: t('batch.student'),
      render: (r) => (
        <span>
          <span className="font-medium text-slate-900">{r.fullName}</span>{' '}
          <span className="text-xs text-slate-600">{r.rollNo}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: t('batch.status'),
      render: (r) => <StatusBadge status={r.enrollmentStatus as never} />,
    },
    {
      key: 'report',
      header: <span className="sr-only">{t('batch.report')}</span>,
      align: 'right',
      render: (r) => (
        <Button
          size="sm"
          variant="secondary"
          loading={busy === r.enrollmentId}
          disabled={busy !== null}
          aria-label={t('batch.reportFor', { name: r.fullName })}
          onClick={() => void download(r)}
        >
          {t('batch.report')}
        </Button>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <h3 className="mb-2 text-base font-semibold text-slate-900">{t('batch.students')}</h3>
      <Table
        caption={t('batch.studentsCaption')}
        columns={columns}
        rows={batch.data.roster ?? []}
        rowKey={(r) => r.enrollmentId}
      />
    </div>
  );
}

function CourseReports() {
  const { t } = useTranslation('reports');
  const courses = useAdminCourses();
  const [courseId, setCourseId] = useState('');
  const chosen = courses.data?.find((c) => c.id === courseId);

  return (
    <Card title={t('course.heading')} headingLevel={2}>
      <p className="-mt-2 mb-4 text-sm text-slate-600">{t('course.desc')}</p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80 max-w-full">
          <Select
            label={t('course.course')}
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            options={[
              { value: '', label: t('course.choose') },
              ...(courses.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.title} (${c.code})`,
              })),
            ]}
          />
        </div>
        {chosen && (
          <ReportButtons
            name={chosen.title}
            download={(format) => downloadCourseReport(chosen.id, chosen.code, format)}
          />
        )}
      </div>
    </Card>
  );
}
