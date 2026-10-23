import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CompetencyInputSchema,
  PROFICIENCY_LEVELS,
  type AssessmentMode,
  type CompetencyDto,
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
import { useAdminCourses } from '../admin-courses/api';
import {
  useCompetencies,
  useDeleteCompetency,
  useLinkableAssessments,
  useSaveCompetency,
} from './api';
import { ResourceLibrary } from './ResourceLibrary';

/** Admin: competency model per course (BRQ-C.1) and its resource library (BRQ-12.3). */
export function AdminCompetenciesPage() {
  const { t } = useTranslation('competency');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const courses = useAdminCourses();
  const [params, setParams] = useSearchParams();
  const courseId = params.get('course') ?? '';
  const list = useCompetencies(courseId || undefined);
  const remove = useDeleteCompetency();
  const [editing, setEditing] = useState<CompetencyDto | 'new' | null>(null);

  const onDelete = async (c: CompetencyDto) => {
    try {
      await remove.mutateAsync(c.id);
      toast.show({ tone: 'success', title: t('admin.deleted') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const columns: Column<CompetencyDto>[] = [
    {
      key: 'code',
      header: t('admin.code'),
      render: (c) => <span className="font-mono text-sm">{c.code}</span>,
    },
    {
      key: 'title',
      header: t('admin.titleField'),
      render: (c) => (
        <span>
          <span className="font-medium text-slate-900">{c.title}</span>
          <span className="block text-xs text-slate-600">
            {t(`mode.${c.mode}`)}
            {c.isMandatory ? ` · ${t('mandatory')}` : ''}
          </span>
        </span>
      ),
    },
    { key: 'required', header: t('admin.required'), render: (c) => t(`level.${c.requiredLevel}`) },
    {
      key: 'evidence',
      header: t('admin.evidence'),
      render: (c) =>
        c.assessments.length ? (
          <ul className="text-xs text-slate-700">
            {c.assessments.map((a) => (
              <li key={a.id}>{`${a.title} (${a.batchName})`}</li>
            ))}
          </ul>
        ) : (
          t('none')
        ),
    },
    {
      key: 'resources',
      header: t('admin.resources'),
      align: 'right',
      render: (c) => c.resourceCount,
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('admin.edit')}</span>,
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="secondary"
            aria-label={t('admin.editFor', { code: c.code })}
            onClick={() => setEditing(c)}
          >
            {t('admin.edit')}
          </Button>
          {c.ratingCount === 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('admin.deleteFor', { code: c.code })}
              onClick={() => void onDelete(c)}
            >
              {t('admin.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('admin.intro')}</p>
      </div>
      <div className="w-96 max-w-full">
        <Select
          label={t('admin.course')}
          value={courseId}
          onChange={(e) =>
            setParams(e.target.value ? { course: e.target.value } : {}, { replace: true })
          }
          options={[
            { value: '', label: t('admin.chooseCourse') },
            ...(courses.data ?? []).map((c) => ({ value: c.id, label: `${c.title} (${c.code})` })),
          ]}
        />
      </div>
      {courseId && (
        <>
          <Card
            title={t('admin.caption')}
            actions={
              <Button size="sm" onClick={() => setEditing('new')}>
                {t('admin.add')}
              </Button>
            }
          >
            {list.isPending ? (
              <Spinner />
            ) : list.isError ? (
              <EmptyState title={errorMessage(list.error)} />
            ) : (
              <Table
                caption={t('admin.caption')}
                columns={columns}
                rows={list.data}
                rowKey={(c) => c.id}
                empty={<EmptyState title={t('admin.empty')} />}
              />
            )}
          </Card>
          <ResourceLibrary courseId={courseId} />
          <CompetencyForm
            courseId={courseId}
            competency={editing}
            onClose={() => setEditing(null)}
          />
        </>
      )}
    </div>
  );
}

interface FormValues {
  code: string;
  title: string;
  description: string;
  mode: AssessmentMode;
  requiredLevel: number;
  isMandatory: boolean;
  assessmentIds: string[];
}
const EMPTY: FormValues = {
  code: '',
  title: '',
  description: '',
  mode: 'PRACTICAL',
  requiredLevel: 3,
  isMandatory: true,
  assessmentIds: [],
};

function CompetencyForm({
  courseId,
  competency,
  onClose,
}: {
  courseId: string;
  competency: CompetencyDto | 'new' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('competency');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const linkable = useLinkableAssessments(courseId, !!competency);
  const save = useSaveCompetency();
  const existing = competency && competency !== 'new' ? competency : null;
  const [v, setV] = useState<FormValues>(EMPTY);
  const [invalid, setInvalid] = useState<Set<string>>(new Set());
  const groupId = useId();

  useEffect(() => {
    if (!competency) return;
    setV(
      existing
        ? {
            code: existing.code,
            title: existing.title,
            description: existing.description ?? '',
            mode: existing.mode,
            requiredLevel: existing.requiredLevel,
            isMandatory: existing.isMandatory,
            assessmentIds: existing.assessments.map((a) => a.id),
          }
        : EMPTY,
    );
    setInvalid(new Set());
  }, [competency, existing]);

  const set = (patch: Partial<FormValues>) => setV((x) => ({ ...x, ...patch }));
  const toggle = (id: string) =>
    set({
      assessmentIds: v.assessmentIds.includes(id)
        ? v.assessmentIds.filter((x) => x !== id)
        : [...v.assessmentIds, id],
    });

  const submit = async () => {
    const parsed = CompetencyInputSchema.safeParse({
      ...v,
      description: v.description.trim() || null,
    });
    if (!parsed.success) {
      setInvalid(new Set(parsed.error.issues.map((i) => String(i.path[0]))));
      return;
    }
    try {
      await save.mutateAsync({ courseId, id: existing?.id, input: parsed.data });
      toast.show({ tone: 'success', title: t('admin.saved') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };
  const err = (k: string) => (invalid.has(k) ? t('admin.invalid') : undefined);

  return (
    <Modal
      open={!!competency}
      onClose={onClose}
      title={existing ? t('admin.editFor', { code: existing.code }) : t('admin.add')}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('admin.code')}
          value={v.code}
          error={err('code')}
          onChange={(e) => set({ code: e.target.value })}
        />
        <Select
          label={t('admin.modeField')}
          value={v.mode}
          onChange={(e) => set({ mode: e.target.value as AssessmentMode })}
          options={(['THEORY', 'PRACTICAL'] as const).map((m) => ({
            value: m,
            label: t(`mode.${m}`),
          }))}
        />
        <div className="sm:col-span-2">
          <Input
            label={t('admin.titleField')}
            value={v.title}
            error={err('title')}
            onChange={(e) => set({ title: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            label={t('admin.description')}
            value={v.description}
            onChange={(e) => set({ description: e.target.value })}
          />
        </div>
        <Select
          label={t('admin.required')}
          value={String(v.requiredLevel)}
          onChange={(e) => set({ requiredLevel: Number(e.target.value) })}
          options={PROFICIENCY_LEVELS.map((l) => ({ value: String(l), label: t(`level.${l}`) }))}
        />
        <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={v.isMandatory}
            onChange={(e) => set({ isMandatory: e.target.checked })}
          />
          {t('admin.mandatoryField')}
        </label>
        <fieldset className="sm:col-span-2" aria-describedby={`${groupId}-hint`}>
          <legend className="text-sm font-medium text-slate-800">{t('admin.evidence')}</legend>
          <p id={`${groupId}-hint`} className="text-xs text-slate-600">
            {t('admin.evidenceHint')}
          </p>
          {linkable.isPending ? (
            <Spinner />
          ) : (linkable.data ?? []).length === 0 ? (
            <p className="mt-1 text-sm text-slate-700">{t('admin.noAssessments')}</p>
          ) : (
            <ul className="mt-2 grid max-h-48 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {linkable.data!.map((a) => (
                <li key={a.id}>
                  <label className="flex items-center gap-2 text-sm text-slate-800">
                    <input
                      type="checkbox"
                      className="h-4 w-4"
                      checked={v.assessmentIds.includes(a.id)}
                      onChange={() => toggle(a.id)}
                    />
                    {a.title}
                    <Badge tone="neutral">{a.batchName}</Badge>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
      </div>
    </Modal>
  );
}
