import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../../lib/api/client';
import { Button, Card, EmptyState, Spinner, cn } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useResults, useSaveResults } from './api';

type Draft = Record<string, { marks: string; remarks: string }>;

/**
 * Marks entry for one assessment (BRQ-6.2, BR-07). Each value is checked against 0..max as
 * it is typed; the API repeats the check and nothing is saved if any row is out of range.
 */
export function MarksPage({ back }: { /** Defaults to the batch page (admin). */ back?: string }) {
  const { assessmentId = '' } = useParams();
  const { t } = useTranslation('training');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const sheet = useResults(assessmentId);
  const save = useSaveResults();
  const [draft, setDraft] = useState<Draft>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [serverBad, setServerBad] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sheet.data) return;
    setDraft(
      Object.fromEntries(
        sheet.data.rows.map((r) => [
          r.studentId,
          { marks: r.marks === null ? '' : String(r.marks), remarks: r.remarks ?? '' },
        ]),
      ),
    );
  }, [sheet.data]);

  if (sheet.isPending) return <Spinner size="lg" />;
  if (sheet.isError) return <EmptyState title={errorMessage(sheet.error)} />;
  const { assessment: a, rows } = sheet.data;

  const invalid = (v: string) => {
    if (v.trim() === '') return false;
    const n = Number(v);
    return !Number.isFinite(n) || n < 0 || n > a.maxMarks || Math.round(n * 100) !== n * 100;
  };

  const onSave = async () => {
    setProblem(null);
    setServerBad(new Set());
    const entries = rows.filter((r) => (draft[r.studentId]?.marks ?? '').trim() !== '');
    if (entries.some((r) => invalid(draft[r.studentId]!.marks)))
      return setProblem(t('marks.range', { max: a.maxMarks }));
    if (entries.length === 0) return setProblem(t('marks.nothing'));
    try {
      await save.mutateAsync({
        id: assessmentId,
        input: {
          results: entries.map((r) => ({
            studentId: r.studentId,
            marks: Number(draft[r.studentId]!.marks),
            remarks: draft[r.studentId]!.remarks.trim() || null,
          })),
        },
      });
      toast.show({ tone: 'success', title: t('marks.saved') });
    } catch (err) {
      setProblem(errorMessage(err));
      // Per-row problems come back with the student id as the path.
      if (err instanceof ApiError && err.details)
        setServerBad(new Set(err.details.map((d) => d.path)));
    }
  };

  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft((d) => ({ ...d, [id]: { marks: '', remarks: '', ...d[id], ...patch } }));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link
        to={back ?? `/admin/batches/${a.batchId}`}
        className="text-sm font-medium text-brand-700 underline hover:text-brand-900"
      >
        {t('sheet.back')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t('marks.title', { title: a.title })}
        </h1>
        <p className="mt-1 text-sm text-slate-700">
          {t(`assessments.mode.${a.mode}`)} · {t('marks.outOf', { max: a.maxMarks })} ·{' '}
          {t('assessments.fields.weightage')} {a.weightage}
        </p>
      </div>
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t('assessments.empty')} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const v = draft[r.studentId] ?? { marks: '', remarks: '' };
              const bad = invalid(v.marks) || serverBad.has(r.studentId);
              const errId = `marks-err-${r.studentId}`;
              return (
                <li
                  key={r.studentId}
                  className="grid gap-2 py-3 sm:grid-cols-[1fr_8rem_1fr] sm:items-start"
                >
                  <span className="pt-2">
                    <span className="font-medium text-slate-900">{r.fullName}</span>{' '}
                    <span className="text-xs text-slate-600">{r.rollNo}</span>
                  </span>
                  <div>
                    <label htmlFor={`marks-${r.studentId}`} className="sr-only">
                      {t('marks.marksFor', { name: r.fullName })}
                    </label>
                    <input
                      id={`marks-${r.studentId}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={a.maxMarks}
                      step="0.01"
                      placeholder={t('marks.marks')}
                      value={v.marks}
                      aria-invalid={bad || undefined}
                      aria-describedby={bad ? errId : undefined}
                      onChange={(e) => set(r.studentId, { marks: e.target.value })}
                      className={cn(
                        'w-full rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600',
                        bad ? 'border-red-600' : 'border-slate-400',
                      )}
                    />
                    {bad && (
                      <p id={errId} className="mt-1 text-xs text-red-700">
                        {t('marks.range', { max: a.maxMarks })}
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor={`remarks-${r.studentId}`} className="sr-only">
                      {t('marks.remarksFor', { name: r.fullName })}
                    </label>
                    <input
                      id={`remarks-${r.studentId}`}
                      type="text"
                      maxLength={500}
                      placeholder={t('marks.remarks')}
                      value={v.remarks}
                      onChange={(e) => set(r.studentId, { remarks: e.target.value })}
                      className="w-full rounded-md border border-slate-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {problem && (
          <p
            role="alert"
            className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {problem}
          </p>
        )}
        {rows.length > 0 && (
          <div className="mt-4">
            <Button onClick={() => void onSave()} loading={save.isPending}>
              {t('marks.save')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
