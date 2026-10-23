import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LEARNING_RESOURCE_TYPES,
  ResourceInputSchema,
  type LearningResourceType,
  type ResourceDto,
} from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  Select,
  Spinner,
  Table,
  type Column,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useAuth } from '../../lib/auth';
import {
  useApproveResource,
  useCompetencies,
  useDeleteResource,
  useResources,
  useSaveResource,
} from './api';

/**
 * Curated resources of a course (BRQ-12.3). Trainers and admins add; an admin's addition is
 * approved at once, a trainer's waits for an admin. Only approved ones reach students.
 */
export function ResourceLibrary({
  courseId,
  headingLevel = 2,
}: {
  courseId: string;
  headingLevel?: 2 | 3;
}) {
  const { t } = useTranslation('competency');
  const { user } = useAuth();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const list = useResources(courseId);
  const approve = useApproveResource();
  const remove = useDeleteResource();
  const [editing, setEditing] = useState<ResourceDto | 'new' | null>(null);
  const isAdmin = user?.role === 'ADMIN';

  const act = async (fn: () => Promise<unknown>, title: string) => {
    try {
      await fn();
      toast.show({ tone: 'success', title });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const columns: Column<ResourceDto>[] = [
    {
      key: 'competency',
      header: t('resources.competency'),
      render: (r) => <span className="font-mono text-xs">{r.competencyCode}</span>,
    },
    {
      key: 'title',
      header: t('resources.titleField'),
      render: (r) => (
        <span>
          <a
            href={r.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-brand-700 underline hover:text-brand-900"
          >
            {r.title}
          </a>
          <span className="sr-only"> {t('gaps.opensNewTab')}</span>
          <span className="block text-xs text-slate-600">
            {t('resources.by', { name: r.createdBy })}
          </span>
        </span>
      ),
    },
    { key: 'type', header: t('resources.type'), render: (r) => t(`resourceType.${r.type}`) },
    {
      key: 'status',
      header: t('resources.status'),
      render: (r) => (
        <Badge tone={r.approved ? 'success' : 'warning'}>
          {r.approved ? t('resources.approved') : t('resources.pending')}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('resources.edit')}</span>,
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          {isAdmin && !r.approved && (
            <Button
              size="sm"
              aria-label={t('resources.approveFor', { title: r.title })}
              onClick={() =>
                void act(() => approve.mutateAsync(r.id), t('resources.approvedToast'))
              }
            >
              {t('resources.approve')}
            </Button>
          )}
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('resources.editFor', { title: r.title })}
            onClick={() => setEditing(r)}
          >
            {t('resources.edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label={t('resources.deleteFor', { title: r.title })}
            onClick={() => void act(() => remove.mutateAsync(r.id), t('resources.deleted'))}
          >
            {t('resources.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <Card
      title={t('resources.title')}
      headingLevel={headingLevel}
      actions={
        <Button size="sm" onClick={() => setEditing('new')}>
          {t('resources.add')}
        </Button>
      }
    >
      <p className="-mt-2 mb-3 text-sm text-slate-600">{t('resources.intro')}</p>
      {list.isPending ? (
        <Spinner />
      ) : list.isError ? (
        <EmptyState title={errorMessage(list.error)} />
      ) : (
        <Table
          caption={t('resources.caption')}
          columns={columns}
          rows={list.data}
          rowKey={(r) => r.id}
          empty={<EmptyState title={t('resources.empty')} />}
        />
      )}
      <ResourceForm courseId={courseId} resource={editing} onClose={() => setEditing(null)} />
    </Card>
  );
}

function ResourceForm({
  courseId,
  resource,
  onClose,
}: {
  courseId: string;
  resource: ResourceDto | 'new' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('competency');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const competencies = useCompetencies(courseId);
  const save = useSaveResource();
  const existing = resource && resource !== 'new' ? resource : null;
  const [values, setValues] = useState({
    competencyId: '',
    title: '',
    type: 'VIDEO' as LearningResourceType,
    url: '',
  });
  const [invalid, setInvalid] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!resource) return;
    setValues(
      existing
        ? {
            competencyId: existing.competencyId,
            title: existing.title,
            type: existing.type,
            url: existing.url,
          }
        : { competencyId: '', title: '', type: 'VIDEO', url: '' },
    );
    setInvalid(new Set());
  }, [resource, existing]);

  const submit = async () => {
    const parsed = ResourceInputSchema.safeParse(values);
    if (!parsed.success) {
      setInvalid(new Set(parsed.error.issues.map((i) => String(i.path[0]))));
      return;
    }
    try {
      await save.mutateAsync({ id: existing?.id, input: parsed.data });
      toast.show({ tone: 'success', title: t('resources.saved') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };
  const err = (k: string) => (invalid.has(k) ? t('admin.invalid') : undefined);
  const set = (patch: Partial<typeof values>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <Modal
      open={!!resource}
      onClose={onClose}
      title={existing ? t('resources.editFor', { title: existing.title }) : t('resources.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('admin.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => void submit()}>
            {t('admin.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Select
          label={t('resources.competency')}
          value={values.competencyId}
          error={err('competencyId')}
          onChange={(e) => set({ competencyId: e.target.value })}
          options={[
            { value: '', label: t('resources.chooseCompetency') },
            ...(competencies.data ?? []).map((c) => ({
              value: c.id,
              label: `${c.code} · ${c.title}`,
            })),
          ]}
        />
        <Input
          label={t('resources.titleField')}
          value={values.title}
          error={err('title')}
          onChange={(e) => set({ title: e.target.value })}
        />
        <Select
          label={t('resources.type')}
          value={values.type}
          onChange={(e) => set({ type: e.target.value as LearningResourceType })}
          options={LEARNING_RESOURCE_TYPES.map((v) => ({
            value: v,
            label: t(`resourceType.${v}`),
          }))}
        />
        <Input
          label={t('resources.url')}
          type="url"
          inputMode="url"
          placeholder="https://"
          value={values.url}
          error={err('url')}
          onChange={(e) => set({ url: e.target.value })}
        />
      </div>
    </Modal>
  );
}
