import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BATCH_STATUSES, type BatchStatus, type BatchSummary } from '@vtmp/shared';
import { Button, EmptyState, Select, Spinner, Table, type Column } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDay } from '../../lib/format';
import { useAdminCourses, useAdminCycles } from '../admin-courses/api';
import { useAdminBatches } from './api';
import { BatchStatusBadge, FillBar } from './bits';
import { BatchFormModal } from './forms';

const linkButton =
  'inline-flex h-10 items-center rounded-md border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600';

/** Admin: batches per cycle with fill, trainers and status (BRQ-4.1). */
export function AdminBatchesPage() {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const cycles = useAdminCycles();
  const courses = useAdminCourses();
  const [cycleId, setCycleId] = useState<string>();
  const [courseId, setCourseId] = useState('');
  const [status, setStatus] = useState<BatchStatus | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const list = useAdminBatches({ cycleId, courseId, status });

  useEffect(() => {
    if (!cycleId && cycles.data?.[0]) setCycleId(cycles.data[0].id);
  }, [cycleId, cycles.data]);

  const columns: Column<BatchSummary>[] = [
    {
      key: 'name',
      header: t('fields.name'),
      render: (b) => (
        <Link
          to={`/admin/batches/${b.id}`}
          className="font-medium text-brand-700 underline hover:text-brand-900"
          aria-label={t('list.openFor', { name: `${b.courseTitle} ${b.name}` })}
        >
          {b.name}
        </Link>
      ),
    },
    { key: 'course', header: t('fields.course'), render: (b) => b.courseTitle },
    {
      key: 'fill',
      header: t('fields.enrolled'),
      render: (b) => <FillBar existing={b.enrolled} capacity={b.capacity} />,
    },
    {
      key: 'dates',
      header: t('fields.dates'),
      render: (b) => (
        <span className="text-xs">{`${formatDay(b.startDate, lng)} – ${formatDay(b.endDate, lng)}`}</span>
      ),
    },
    { key: 'venue', header: t('fields.venue'), render: (b) => b.venue },
    {
      key: 'trainers',
      header: t('fields.trainers'),
      render: (b) =>
        b.trainers.length ? (
          b.trainers.map((tr) => tr.fullName).join(', ')
        ) : (
          <span className="text-slate-600">{t('fields.noTrainer')}</span>
        ),
    },
    {
      key: 'status',
      header: t('fields.status'),
      render: (b) => <BatchStatusBadge status={b.status} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('list.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-700">{t('list.intro')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/batches/allocation" className={linkButton}>
            {t('list.allocate')}
          </Link>
          <Button onClick={() => setFormOpen(true)} disabled={!cycleId}>
            {t('list.create')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          label={t('fields.cycle')}
          value={cycleId ?? ''}
          onChange={(e) => setCycleId(e.target.value)}
          options={(cycles.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />
        <Select
          label={t('fields.course')}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          options={[
            { value: '', label: t('list.allCourses') },
            ...(courses.data ?? []).map((c) => ({ value: c.id, label: c.title })),
          ]}
        />
        <Select
          label={t('fields.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as BatchStatus | '')}
          options={[
            { value: '', label: t('list.allStatuses') },
            ...BATCH_STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
          ]}
        />
      </div>

      {list.isPending ? (
        <Spinner size="lg" />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : (
        <Table
          caption={t('list.caption')}
          columns={columns}
          rows={list.data}
          rowKey={(b) => b.id}
          empty={<EmptyState title={t('list.empty')} />}
        />
      )}

      {cycleId && (
        <BatchFormModal
          open={formOpen}
          cycleId={cycleId}
          courses={courses.data ?? []}
          batch={null}
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
