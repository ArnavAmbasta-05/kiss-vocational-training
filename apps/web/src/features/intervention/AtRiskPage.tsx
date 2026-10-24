import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { RISK_LEVELS, type RiskFlagQuery, type RiskFlagRow, type RiskLevel } from '@vtmp/shared';
import {
  Badge,
  Button,
  EmptyState,
  Select,
  Spinner,
  Table,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAuth } from '../../lib/auth';
import { useMyBatches } from '../batches/api';
import { useRiskFlags, useRunEvaluation } from './api';
import { LevelBadge, ReasonChips } from './RiskBits';
import { daysSince } from './risk';

const PAGE_SIZE = 20;

/**
 * Trainer (own batches) and Admin (all): students flagged by the daily evaluation, with the
 * reason for each flag (BRQ-11.2), how long it has been open and how many actions it has.
 */
export function AtRiskPage({ base }: { base: string }) {
  const { t } = useTranslation('intervention');
  const errorMessage = useErrorMessage();
  const toast = useToast();
  const { user } = useAuth();
  const run = useRunEvaluation();
  const batches = useMyBatches();
  const [batchId, setBatchId] = useState('');
  const [level, setLevel] = useState<RiskLevel | ''>('');
  const [status, setStatus] = useState<RiskFlagQuery['status']>('OPEN');
  const [page, setPage] = useState(1);
  const list = useRiskFlags({
    batchId: batchId || undefined,
    level: level || undefined,
    status,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: Column<RiskFlagRow>[] = [
    {
      key: 'student',
      header: t('list.student'),
      render: (f) => (
        <Link
          to={`${base}/${f.id}`}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
          aria-label={t('list.openFor', { name: f.student.fullName })}
        >
          {f.student.fullName}
          <span className="block text-xs font-normal text-slate-600">
            {f.student.rollNo} · {f.batch.name}
          </span>
        </Link>
      ),
    },
    {
      key: 'level',
      header: t('list.level'),
      render: (f) => (
        <span className="flex flex-col items-start gap-1">
          <LevelBadge level={f.level} />
          {f.escalatedAt && <Badge tone="danger">{t('list.escalated')}</Badge>}
          {f.clearSince && !f.closedAt && <Badge tone="success">{t('list.improving')}</Badge>}
        </span>
      ),
    },
    {
      key: 'reasons',
      header: t('list.reasons'),
      render: (f) => <ReasonChips reasons={f.reasons} />,
    },
    {
      key: 'age',
      header: t('list.age'),
      align: 'center',
      render: (f) => t('list.days', { count: daysSince(f.openedAt) }),
    },
    {
      key: 'actions',
      header: t('list.actions'),
      align: 'center',
      render: (f) =>
        f.actionCount === 0
          ? t('list.noActions')
          : t('list.actionCount', { count: f.actionCount, open: f.openActionCount }),
    },
  ];

  const meta = list.data?.meta;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('list.title')}</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('list.intro')}</p>
        </div>
        {user?.role === 'ADMIN' && (
          <Button
            variant="secondary"
            loading={run.isPending}
            onClick={() =>
              run.mutate(undefined, {
                onSuccess: (r) =>
                  toast.show({
                    tone: 'success',
                    title: r.skipped
                      ? t('list.runSkipped')
                      : t('list.runDone', { students: r.students, opened: r.opened }),
                  }),
                onError: (err) => toast.show({ tone: 'error', title: errorMessage(err) }),
              })
            }
          >
            {t('list.run')}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-80 max-w-full">
          <Select
            label={t('list.batch')}
            value={batchId}
            onChange={(e) => {
              setBatchId(e.target.value);
              setPage(1);
            }}
            options={[
              {
                value: '',
                label: t(user?.role === 'ADMIN' ? 'list.everyBatch' : 'list.allBatches'),
              },
              ...(batches.data ?? [])
                .filter((b) => b.status === 'ACTIVE')
                .map((b) => ({ value: b.id, label: `${b.courseTitle} · ${b.name}` })),
            ]}
          />
        </div>
        <div className="w-40">
          <Select
            label={t('list.level')}
            value={level}
            onChange={(e) => {
              setLevel(e.target.value as RiskLevel | '');
              setPage(1);
            }}
            options={[
              { value: '', label: t('list.anyLevel') },
              ...RISK_LEVELS.filter((l) => l !== 'LOW').map((l) => ({
                value: l,
                label: t(`level.${l}`),
              })),
            ]}
          />
        </div>
        <div className="w-40">
          <Select
            label={t('list.status')}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as RiskFlagQuery['status']);
              setPage(1);
            }}
            options={(['OPEN', 'CLOSED', 'ALL'] as const).map((s) => ({
              value: s,
              label: t(`status.${s}`),
            }))}
          />
        </div>
      </div>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : (
        <Table
          caption={t('list.caption')}
          columns={columns}
          rows={list.data.data}
          rowKey={(f) => f.id}
          empty={<EmptyState title={t('list.empty')} description={t('list.emptyHint')} />}
        />
      )}
      {meta && meta.totalPages > 1 && (
        <nav className="flex items-center gap-3" aria-label={t('list.pages')}>
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            {t('list.previous')}
          </Button>
          <span className="text-sm text-slate-700">
            {t('list.page', { page: meta.page, pages: meta.totalPages })}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t('list.next')}
          </Button>
        </nav>
      )}
    </div>
  );
}
