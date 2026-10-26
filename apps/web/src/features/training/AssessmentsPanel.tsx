import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  AssessmentCreateSchema,
  type AssessmentCreateInput,
  type AssessmentDto,
} from '@vtmp/shared';
import {
  Badge,
  Button,
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
import { formatDay } from '../../lib/format';
import {
  useAssessments,
  useCreateAssessment,
  useDeleteAssessment,
  useUpdateAssessment,
} from './api';

/** Assessments of one batch (BRQ-6.1): list, add, edit, delete, and a link into marks entry. */
export function AssessmentsPanel({
  batchId,
  editable,
  marksBase,
}: {
  batchId: string;
  /** False once the batch is closed. */
  editable: boolean;
  /** Route prefix for the marks page, e.g. "/trainer/assessments". */
  marksBase: string;
}) {
  const { t, i18n } = useTranslation('training');
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const list = useAssessments(batchId);
  const remove = useDeleteAssessment();
  const [editing, setEditing] = useState<AssessmentDto | 'new' | null>(null);

  if (list.isPending) return <Spinner />;
  if (list.isError) return <EmptyState title={errorMessage(list.error)} />;

  const onDelete = async (a: AssessmentDto) => {
    try {
      await remove.mutateAsync(a.id);
      toast.show({ tone: 'success', title: t('assessments.deleted') });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  const columns: Column<AssessmentDto>[] = [
    {
      key: 'title',
      header: t('assessments.fields.title'),
      render: (a) => <span className="font-medium">{a.title}</span>,
    },
    {
      key: 'mode',
      header: t('assessments.fields.mode'),
      render: (a) => t(`assessments.mode.${a.mode}`),
    },
    {
      key: 'max',
      header: t('assessments.fields.maxMarks'),
      align: 'right',
      render: (a) => a.maxMarks,
    },
    {
      key: 'weight',
      header: t('assessments.fields.weightage'),
      align: 'right',
      render: (a) => a.weightage,
    },
    {
      key: 'mandatory',
      header: <span className="sr-only">{t('assessments.fields.isMandatory')}</span>,
      render: (a) => (
        <Badge tone={a.isMandatory ? 'info' : 'neutral'}>
          {a.isMandatory ? t('assessments.mandatory') : t('assessments.optional')}
        </Badge>
      ),
    },
    {
      key: 'held',
      header: t('assessments.fields.heldOn'),
      render: (a) => (a.heldOn ? formatDay(a.heldOn, lng) : '—'),
    },
    {
      key: 'recorded',
      header: t('assessments.fields.recorded'),
      align: 'right',
      render: (a) => t('assessments.recordedOf', { recorded: a.recorded, total: a.rosterSize }),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('assessments.marks')}</span>,
      align: 'right',
      render: (a) => (
        <div className="flex justify-end gap-1">
          <Link
            to={`${marksBase}/${a.id}`}
            aria-label={t('assessments.marksFor', { title: a.title })}
            className="inline-flex h-8 items-center rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          >
            {t('assessments.marks')}
          </Link>
          {a.mode === 'PRACTICAL' && a.recorded > 0 && (
            <Link
              to={`${marksBase}/${a.id}/evidence`}
              aria-label={t('assessments.evidenceFor', { title: a.title })}
              className="inline-flex h-8 items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              {t('assessments.evidence')}
            </Link>
          )}
          {editable && (
            <Button
              size="sm"
              variant="secondary"
              aria-label={t('assessments.editFor', { title: a.title })}
              onClick={() => setEditing(a)}
            >
              {t('assessments.edit')}
            </Button>
          )}
          {editable && a.recorded === 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-label={t('assessments.deleteFor', { title: a.title })}
              onClick={() => void onDelete(a)}
            >
              {t('assessments.delete')}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {editable && (
        <div>
          <Button onClick={() => setEditing('new')}>{t('assessments.add')}</Button>
        </div>
      )}
      <Table
        caption={t('assessments.caption')}
        columns={columns}
        rows={list.data}
        rowKey={(a) => a.id}
        empty={<EmptyState title={t('assessments.empty')} />}
      />
      <AssessmentFormModal
        batchId={batchId}
        assessment={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

type FormValues = Omit<AssessmentCreateInput, 'heldOn' | 'maxMarks' | 'weightage'> & {
  maxMarks: string | number;
  weightage: string | number;
  heldOn: string;
};
/** The date input yields '' when empty; the API wants null. */
const FormSchema = AssessmentCreateSchema.extend({
  heldOn: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
});

function AssessmentFormModal({
  batchId,
  assessment,
  onClose,
}: {
  batchId: string;
  assessment: AssessmentDto | 'new' | null;
  onClose: () => void;
}) {
  const { t } = useTranslation('training');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const create = useCreateAssessment();
  const update = useUpdateAssessment();
  const existing = assessment && assessment !== 'new' ? assessment : null;
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(FormSchema) as never });

  useEffect(() => {
    if (!assessment) return;
    reset(
      existing
        ? { ...existing, heldOn: existing.heldOn ?? '' }
        : { title: '', mode: 'THEORY', maxMarks: 100, weightage: 1, isMandatory: true, heldOn: '' },
    );
  }, [assessment, existing, reset]);

  const onSubmit = handleSubmit(async (raw) => {
    const v = AssessmentCreateSchema.parse({ ...raw, heldOn: raw.heldOn || null });
    try {
      if (existing) await update.mutateAsync({ id: existing.id, input: v });
      else await create.mutateAsync({ batchId, input: v });
      toast.show({ tone: 'success', title: t('assessments.saved') });
      onClose();
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  });
  const err = (k: keyof FormValues) => (errors[k] ? t('assessments.invalid') : undefined);

  return (
    <Modal
      open={!!assessment}
      onClose={onClose}
      title={existing ? t('assessments.editFor', { title: existing.title }) : t('assessments.add')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('assessments.cancel')}
          </Button>
          <Button type="submit" form="assessment-form" loading={isSubmitting}>
            {t('assessments.save')}
          </Button>
        </>
      }
    >
      <form
        id="assessment-form"
        noValidate
        onSubmit={(e) => void onSubmit(e)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="sm:col-span-2">
          <Input
            label={t('assessments.fields.title')}
            required
            error={err('title')}
            {...register('title')}
          />
        </div>
        <Select
          label={t('assessments.fields.mode')}
          options={(['THEORY', 'PRACTICAL'] as const).map((m) => ({
            value: m,
            label: t(`assessments.mode.${m}`),
          }))}
          {...register('mode')}
        />
        <Input
          label={t('assessments.fields.heldOn')}
          type="date"
          error={err('heldOn')}
          {...register('heldOn')}
        />
        <Input
          label={t('assessments.fields.maxMarks')}
          type="number"
          min={0.01}
          step="0.01"
          required
          error={err('maxMarks')}
          {...register('maxMarks')}
        />
        <Input
          label={t('assessments.fields.weightage')}
          type="number"
          min={0.01}
          step="0.01"
          required
          error={err('weightage')}
          {...register('weightage')}
        />
        <label className="flex items-center gap-2 text-sm text-slate-800 sm:col-span-2">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-400 focus-visible:ring-2 focus-visible:ring-brand-600"
            {...register('isMandatory')}
          />
          {t('assessments.fields.isMandatory')}
        </label>
      </form>
    </Modal>
  );
}
