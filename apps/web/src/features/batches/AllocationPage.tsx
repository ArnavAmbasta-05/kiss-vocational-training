import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AllocationPreview } from '@vtmp/shared';
import { Button, Card, EmptyState, Modal, Select, Table, type Column } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { relativeTime } from '../../lib/format';
import { useAdminCycles } from '../admin-courses/api';
import { useConfirmAllocation, usePreviewAllocation } from './api';
import { ScheduleAdvicePanel } from '../scheduling/ScheduleAdvice';
import { FillBar } from './bits';

type Fill = AllocationPreview['batches'][number];
type Placement = AllocationPreview['assignments'][number];

/** Admin: run the allocation engine as a preview, review it, then confirm (BRQ-4.2). */
export function AllocationPage() {
  const { t, i18n } = useTranslation('batches');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const cycles = useAdminCycles();
  const run = usePreviewAllocation();
  const confirm = useConfirmAllocation();
  const [cycleId, setCycleId] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const preview = run.data;

  useEffect(() => {
    if (!cycleId && cycles.data?.[0]) setCycleId(cycles.data[0].id);
  }, [cycleId, cycles.data]);

  const batchName = useMemo(
    () =>
      new Map(
        (preview?.batches ?? []).map((b) => [b.batchId, `${b.courseTitle} · ${b.batchName}`]),
      ),
    [preview],
  );

  const onRun = async () => {
    if (!cycleId) return;
    try {
      await run.mutateAsync(cycleId);
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const onConfirm = async () => {
    if (!preview) return;
    try {
      const r = await confirm.mutateAsync(preview.previewId);
      toast.show({ tone: 'success', title: t('allocation.confirmed', r) });
      run.reset();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    } finally {
      setConfirming(false);
    }
  };

  const fillColumns: Column<Fill>[] = [
    {
      key: 'batch',
      header: t('allocation.batch'),
      render: (b) => <span className="font-medium">{`${b.courseTitle} · ${b.batchName}`}</span>,
    },
    {
      key: 'existing',
      header: t('allocation.existing'),
      align: 'right',
      render: (b) => b.existing,
    },
    {
      key: 'added',
      header: t('allocation.added'),
      align: 'right',
      render: (b) => <span className="font-semibold text-green-800">+{b.added}</span>,
    },
    {
      key: 'after',
      header: t('allocation.after'),
      render: (b) => <FillBar existing={b.existing} added={b.added} capacity={b.capacity} />,
    },
  ];
  const placementColumns: Column<Placement>[] = [
    {
      key: 'student',
      header: t('allocation.student'),
      render: (a) => `${a.studentName} (${a.rollNo})`,
    },
    { key: 'batch', header: t('allocation.batch'), render: (a) => batchName.get(a.batchId) },
    { key: 'rank', header: t('allocation.choice'), align: 'right', render: (a) => a.rank },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/admin/batches"
        className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
      >
        {t('detail.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('allocation.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('allocation.intro')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-72">
          <Select
            label={t('allocation.cycle')}
            value={cycleId ?? ''}
            onChange={(e) => {
              setCycleId(e.target.value);
              run.reset();
            }}
            options={(cycles.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
          />
        </div>
        <Button onClick={() => void onRun()} loading={run.isPending} disabled={!cycleId}>
          {preview ? t('allocation.rerun') : t('allocation.run')}
        </Button>
      </div>

      {preview && (
        <>
          <div
            role="status"
            className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <p className="font-medium">{t('allocation.nothingChanges')}</p>
            <p>
              {t('allocation.priorityRule', {
                rule: t(`allocation.rules.${preview.priorityRule}`),
              })}{' '}
              · {t('allocation.expires', { when: relativeTime(preview.expiresAt, lng) })}
            </p>
          </div>

          {preview.warnings.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm text-slate-800">
              {preview.warnings.map((w) => {
                const [code, count] = w.split(':');
                return (
                  <li key={w} className="rounded-md bg-slate-100 px-3 py-2">
                    {t(`allocation.warnings.${code}`, { count: Number(count ?? 0) })}
                  </li>
                );
              })}
            </ul>
          )}

          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ['applicants', preview.stats.applicants],
              ['allocated', preview.stats.allocated],
              ['waitlisted', preview.stats.waitlisted],
              ['firstChoice', preview.stats.byRank['1'] ?? 0],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg border border-slate-200 bg-white p-4">
                <dt className="text-sm text-slate-600">{t(`allocation.stats.${k}`)}</dt>
                <dd className="text-2xl font-bold text-slate-900" data-testid={`stat-${k}`}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-slate-600">
            {t('allocation.stats.elapsed', { ms: preview.stats.elapsedMs })}
          </p>

          <Card title={t('allocation.batchCaption')}>
            <Table
              caption={t('allocation.batchCaption')}
              columns={fillColumns}
              rows={preview.batches}
              rowKey={(b) => b.batchId}
            />
          </Card>

          <ScheduleAdvicePanel
            fills={preview.batches.map((b) => ({ batchId: b.batchId, added: b.added }))}
          />

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <Card title={t('allocation.assignmentsHeading')}>
              <Table
                caption={t('allocation.assignmentsCaption')}
                columns={placementColumns}
                rows={preview.assignments}
                rowKey={(a) => a.enrollmentId}
              />
            </Card>
            <Card title={t('allocation.waitlistHeading')}>
              {preview.waitlist.length === 0 ? (
                <EmptyState title={t('allocation.waitlistEmpty')} />
              ) : (
                <ul className="flex flex-col gap-1 text-sm">
                  {preview.waitlist.map((w) => (
                    <li key={w.enrollmentId}>
                      {w.studentName} <span className="text-slate-600">({w.rollNo})</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <div>
            <Button
              onClick={() => setConfirming(true)}
              disabled={preview.assignments.length + preview.waitlist.length === 0}
            >
              {t('allocation.confirm')}
            </Button>
          </div>
        </>
      )}

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={t('allocation.confirmTitle')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              {t('form.cancel')}
            </Button>
            <Button loading={confirm.isPending} onClick={() => void onConfirm()}>
              {t('allocation.confirm')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">
          {preview &&
            t('allocation.confirmBody', {
              allocated: preview.stats.allocated,
              waitlisted: preview.stats.waitlisted,
            })}
        </p>
      </Modal>
    </div>
  );
}
