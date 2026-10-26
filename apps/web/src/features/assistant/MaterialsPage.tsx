import { useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { MaterialDto } from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Select,
  Spinner,
  Table,
  type BadgeTone,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDate } from '../../lib/format';
import { useAdminCourses } from '../admin-courses/api';
import {
  useAddMaterial,
  useApproveMaterial,
  useAssistantUsage,
  useDeleteMaterial,
  useMaterials,
  useRejectMaterial,
} from './api';

const TONE: Record<MaterialDto['status'], BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'neutral',
};

/** Browsers often leave .md (and sometimes .txt) without a type; the API needs one. */
const TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
};
function withType(file: File): File {
  if (file.type) return file;
  const type = TYPE_BY_EXTENSION[file.name.split('.').pop()?.toLowerCase() ?? ''];
  return type ? new File([file], file.name, { type }) : file;
}

/**
 * Admin: course materials the assistant answers from (BRQ-17.2) and this month's usage and cost
 * (BRQ-17.5). A material is searchable only after an admin approves it.
 */
export function MaterialsPage() {
  const { t } = useTranslation('assistant');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('admin.intro')}</p>
      </div>
      <UsageCard />
      <UploadCard />
      <MaterialsTable />
    </div>
  );
}

function UsageCard() {
  const { t, i18n } = useTranslation('assistant');
  const errorMessage = useErrorMessage();
  const usage = useAssistantUsage();
  const lng = i18n.resolvedLanguage ?? 'en';
  const usd = new Intl.NumberFormat(lng, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
  const n = new Intl.NumberFormat(lng);
  if (usage.isPending) return <Spinner />;
  if (usage.isError) return <EmptyState title={errorMessage(usage.error)} />;
  const u = usage.data;
  const refused = Object.values(u.refusals).reduce((a, b) => a + b, 0);
  const stats: Array<[string, string]> = [
    [t('admin.usage.questions'), n.format(u.questions)],
    [t('admin.usage.answered'), n.format(u.answered)],
    [t('admin.usage.refused'), n.format(refused)],
    [t('admin.usage.cost'), `${usd.format(u.costUsd)} / ${usd.format(u.monthlyCapUsd)}`],
    [t('admin.usage.tokens'), `${n.format(u.inputTokens)} / ${n.format(u.outputTokens)}`],
    [
      t('admin.usage.latency'),
      u.averageLatencyMs === null ? '—' : t('admin.usage.ms', { ms: n.format(u.averageLatencyMs) }),
    ],
  ];
  return (
    <Card
      title={t('admin.usage.title', { month: u.month })}
      actions={
        <Badge tone={u.enabled ? 'success' : 'neutral'}>
          {u.enabled ? t('admin.usage.on') : t('admin.usage.offBadge')}
        </Badge>
      }
    >
      {!u.enabled && <p className="mb-3 text-sm text-slate-700">{t('admin.usage.offHint')}</p>}
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-slate-600">{label}</dt>
            <dd className="text-lg font-semibold text-slate-900">{value}</dd>
          </div>
        ))}
      </dl>
      {refused > 0 && (
        <p className="mt-3 text-xs text-slate-600">
          {Object.entries(u.refusals)
            .map(
              ([code, count]) =>
                `${t(`admin.refusal.${code}`, { defaultValue: code })}: ${n.format(count)}`,
            )
            .join(' · ')}
        </p>
      )}
    </Card>
  );
}

function UploadCard() {
  const { t } = useTranslation('assistant');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const courses = useAdminCourses();
  const add = useAddMaterial();
  const fileId = useId();
  const [courseId, setCourseId] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!courseId || title.trim().length < 2 || !file) {
      setError(t('admin.upload.missing'));
      return;
    }
    setError(null);
    try {
      await add.mutateAsync({ courseId, title: title.trim(), file: withType(file) });
      toast.show({ tone: 'success', title: t('admin.upload.done') });
      setTitle('');
      setFile(null);
      setFormKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card title={t('admin.upload.title')}>
      <form
        key={formKey}
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => void submit(e)}
        noValidate
      >
        <Select
          label={t('admin.upload.course')}
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          options={[
            { value: '', label: t('admin.upload.chooseCourse') },
            ...(courses.data ?? []).map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
          ]}
          required
        />
        <Input
          label={t('admin.upload.name')}
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor={fileId} className="text-sm font-medium text-slate-900">
            {t('admin.upload.file')}
          </label>
          <input
            id={fileId}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
            aria-describedby={`${fileId}-hint`}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-900 file:mr-3 file:rounded-md file:border file:border-slate-400 file:bg-white file:px-3 file:py-1.5 file:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
          <p id={`${fileId}-hint`} className="text-xs text-slate-600">
            {t('admin.upload.hint')}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-700 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" loading={add.isPending}>
            {t('admin.upload.submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function MaterialsTable() {
  const { t, i18n } = useTranslation('assistant');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const materials = useMaterials();
  const approve = useApproveMaterial();
  const reject = useRejectMaterial();
  const remove = useDeleteMaterial();

  const run = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast.show({ tone: 'success', title: done });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const columns: Column<MaterialDto>[] = [
    {
      key: 'title',
      header: t('admin.table.title'),
      render: (m) => (
        <div>
          <div className="font-medium text-slate-900">{m.title}</div>
          <div className="text-xs text-slate-600">{m.courseTitle}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('admin.table.status'),
      render: (m) => <Badge tone={TONE[m.status]}>{t(`admin.status.${m.status}`)}</Badge>,
    },
    {
      key: 'chunks',
      header: t('admin.table.excerpts'),
      align: 'right',
      render: (m) => (m.status === 'APPROVED' ? m.chunkCount : '—'),
    },
    {
      key: 'added',
      header: t('admin.table.added'),
      render: (m) => (
        <span className="text-xs text-slate-700">
          {m.uploadedBy} · {formatDate(m.createdAt, lng)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('admin.table.actions'),
      render: (m) => (
        <div className="flex flex-wrap gap-2">
          {m.status === 'PENDING' && (
            <>
              <Button
                size="sm"
                loading={approve.isPending && approve.variables === m.id}
                onClick={() =>
                  void run(() => approve.mutateAsync(m.id), t('admin.approved', { title: m.title }))
                }
              >
                {t('admin.approve')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void run(() => reject.mutateAsync(m.id), t('admin.rejected', { title: m.title }))
                }
              >
                {t('admin.reject')}
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('admin.deleteNamed', { title: m.title })}
            onClick={() => {
              if (window.confirm(t('admin.confirmDelete', { title: m.title }))) {
                void run(() => remove.mutateAsync(m.id), t('admin.deleted'));
              }
            }}
          >
            {t('admin.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card title={t('admin.table.heading')}>
      {materials.isPending ? (
        <Spinner />
      ) : materials.isError ? (
        <EmptyState title={errorMessage(materials.error)} />
      ) : (
        <Table
          caption={t('admin.table.heading')}
          columns={columns}
          rows={materials.data}
          rowKey={(m) => m.id}
          empty={<EmptyState title={t('admin.table.empty')} />}
        />
      )}
    </Card>
  );
}
