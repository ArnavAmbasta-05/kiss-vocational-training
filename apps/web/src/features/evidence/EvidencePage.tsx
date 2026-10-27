import { useEffect, useId, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { EvidenceDto, EvidenceSheet, RubricInput } from '@vtmp/shared';
import {
  Badge,
  Button,
  Card,
  cn,
  EmptyState,
  Input,
  Modal,
  PageSkeleton,
  Select,
} from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { openEvidence, useAddEvidence, useEvidenceSheet, useSaveRubric } from './api';
import { compressImage } from './compress';

type Row = EvidenceSheet['rows'][number];

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_BYTES = 10 * 1024 * 1024;

const DEFAULT_RUBRIC: RubricInput = {
  criteria: [
    { key: 'safety', name: 'Works safely' },
    { key: 'method', name: 'Correct method' },
    { key: 'finish', name: 'Quality of finish' },
  ],
  levels: [
    { value: 1, label: 'Beginning' },
    { value: 2, label: 'Developing' },
    { value: 3, label: 'Proficient' },
    { value: 4, label: 'Excellent' },
  ],
};

/**
 * Trainer (and admin): practical evidence for one assessment (F18). A rubric with named
 * criteria and levels (BRQ-18.2), and per student the photos, PDFs or video links that back the
 * marks, each linked to the competency it proves (BRQ-18.1, 18.3).
 */
export function EvidencePage({ back }: { back: string }) {
  const { assessmentId = '' } = useParams();
  const { t } = useTranslation('evidence');
  const errorMessage = useErrorMessage();
  const sheet = useEvidenceSheet(assessmentId);
  const [adding, setAdding] = useState<Row | null>(null);

  if (sheet.isPending) return <PageSkeleton />;
  if (sheet.isError) return <EmptyState title={errorMessage(sheet.error)} />;
  const s = sheet.data;

  return (
    <div className="flex flex-col gap-6">
      <Link to={back} className="text-sm text-brand-700 underline-offset-2 hover:underline">
        ← {t('back')}
      </Link>
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title', { title: s.title })}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('intro')}</p>
      </div>
      <RubricEditor assessmentId={assessmentId} sheet={s} />
      <Card title={t('students')} headingLevel={2}>
        {s.rows.length === 0 ? (
          <EmptyState title={t('noResults')} />
        ) : (
          <ul className="flex flex-col divide-y divide-slate-100" data-testid="evidence-rows">
            {s.rows.map((r) => (
              <li key={r.resultId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                <div className="sm:w-56">
                  <p className="font-medium text-slate-900">{r.fullName}</p>
                  <p className="text-xs text-slate-600">
                    {r.rollNo} · {t('marks', { marks: r.marks })}
                  </p>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {r.evidence.length === 0 ? (
                    <p className="text-sm text-slate-600">{t('none')}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {r.evidence.map((e) => (
                        <EvidenceItem key={e.id} e={e} sheet={s} />
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={t('addFor', { name: r.fullName })}
                  onClick={() => setAdding(r)}
                >
                  {t('add')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {adding && (
        <AddEvidenceModal
          assessmentId={assessmentId}
          row={adding}
          sheet={s}
          onClose={() => setAdding(null)}
        />
      )}
    </div>
  );
}

function EvidenceItem({ e, sheet }: { e: EvidenceDto; sheet: EvidenceSheet }) {
  const { t } = useTranslation('evidence');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const label = e.kind === 'LINK' ? t('videoLink') : (e.fileName ?? t('file'));
  const scores = sheet.rubric
    ? sheet.rubric.criteria
        .filter((c) => e.scores?.[c.key] !== undefined)
        .map((c) => {
          const level = sheet.rubric!.levels.find((l) => l.value === e.scores![c.key]);
          return `${c.name}: ${level?.label ?? e.scores![c.key]}`;
        })
    : [];
  return (
    <li className="rounded-md border border-slate-200 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="info">{e.kind === 'LINK' ? t('kind.LINK') : t('kind.FILE')}</Badge>
        <span className="font-medium text-slate-900">{label}</span>
        {e.competency && <Badge>{e.competency.title}</Badge>}
        <Button
          size="sm"
          variant="ghost"
          aria-label={t('openFor', { name: label })}
          onClick={() =>
            void openEvidence(e.id).catch((err: unknown) =>
              toast.show({ tone: 'error', title: errorMessage(err) }),
            )
          }
        >
          {t('open')}
        </Button>
      </div>
      {scores.length > 0 && <p className="mt-1 text-xs text-slate-700">{scores.join(' · ')}</p>}
      {e.note && <p className="mt-1 text-xs text-slate-700">{e.note}</p>}
      <p className="mt-1 text-xs text-slate-600">{t('by', { name: e.uploadedBy })}</p>
    </li>
  );
}

/** Named criteria and ordered levels (BRQ-18.2); starts from a sensible default. */
function RubricEditor({ assessmentId, sheet }: { assessmentId: string; sheet: EvidenceSheet }) {
  const { t } = useTranslation('evidence');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const save = useSaveRubric(assessmentId);
  const [draft, setDraft] = useState<RubricInput>(sheet.rubric ?? DEFAULT_RUBRIC);
  const [open, setOpen] = useState(false);
  useEffect(() => setDraft(sheet.rubric ?? DEFAULT_RUBRIC), [sheet.rubric]);

  const keyFor = (name: string, i: number) =>
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^(?![a-z])/, 'c')
      .slice(0, 30) || `c${i + 1}`;

  const submit = async () => {
    const used = new Set<string>();
    const criteria = draft.criteria
      .filter((c) => c.name.trim())
      .map((c, i) => {
        let key = c.key || keyFor(c.name, i);
        while (used.has(key)) key = `${key.slice(0, 36)}_${i + 1}`;
        used.add(key);
        return { ...c, name: c.name.trim(), key };
      });
    try {
      await save.mutateAsync({ ...draft, criteria });
      toast.show({ tone: 'success', title: t('rubric.saved') });
      setOpen(false);
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <Card
      title={t('rubric.title')}
      headingLevel={2}
      actions={
        <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? t('rubric.close') : sheet.rubric ? t('rubric.edit') : t('rubric.create')}
        </Button>
      }
    >
      {!open ? (
        sheet.rubric ? (
          <p className="text-sm text-slate-700">
            {t('rubric.summary', {
              criteria: sheet.rubric.criteria.map((c) => c.name).join(', '),
              levels: sheet.rubric.levels.map((l) => l.label).join(' → '),
            })}
          </p>
        ) : (
          <p className="text-sm text-slate-700">{t('rubric.none')}</p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">{t('rubric.criteria')}</legend>
            <div className="mt-2 flex flex-col gap-2">
              {draft.criteria.map((c, i) => (
                <div key={i} className="flex items-end gap-2">
                  <div className="flex-1">
                    <Input
                      label={t('rubric.criterion', { n: i + 1 })}
                      value={c.name}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          criteria: d.criteria.map((x, j) =>
                            j === i ? { ...x, name: e.target.value, key: x.key } : x,
                          ),
                        }))
                      }
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t('rubric.removeCriterion', { n: i + 1 })}
                    disabled={draft.criteria.length <= 1}
                    onClick={() =>
                      setDraft((d) => ({ ...d, criteria: d.criteria.filter((_, j) => j !== i) }))
                    }
                  >
                    {t('rubric.remove')}
                  </Button>
                </div>
              ))}
            </div>
            <Button
              className="mt-2"
              size="sm"
              variant="secondary"
              disabled={draft.criteria.length >= 12}
              onClick={() =>
                setDraft((d) => ({
                  ...d,
                  criteria: [...d.criteria, { key: '', name: '' }],
                }))
              }
            >
              {t('rubric.addCriterion')}
            </Button>
          </fieldset>
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">{t('rubric.levels')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {draft.levels.map((l, i) => (
                <Input
                  key={l.value}
                  label={t('rubric.level', { n: l.value })}
                  value={l.label}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      levels: d.levels.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x,
                      ),
                    }))
                  }
                />
              ))}
            </div>
          </fieldset>
          <div>
            <Button loading={save.isPending} onClick={() => void submit()}>
              {t('rubric.save')}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function AddEvidenceModal({
  assessmentId,
  row,
  sheet,
  onClose,
}: {
  assessmentId: string;
  row: Row;
  sheet: EvidenceSheet;
  onClose: () => void;
}) {
  const { t } = useTranslation('evidence');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const add = useAddEvidence(assessmentId);
  const fileId = useId();
  const noteId = useId();
  const [kind, setKind] = useState<'FILE' | 'LINK'>('FILE');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [url, setUrl] = useState('');
  const [competencyId, setCompetencyId] = useState(sheet.competencies[0]?.id ?? '');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const pick = async (f: File | undefined) => {
    setProblem(null);
    if (!f) return;
    if (!ACCEPT.split(',').includes(f.type)) return setProblem(t('wrongType'));
    setPreparing(true);
    const ready = await compressImage(f);
    setPreparing(false);
    if (ready.size > MAX_BYTES) return setProblem(t('tooLarge'));
    setFile(ready);
  };
  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files[0]);
  };

  const submit = async () => {
    const common = {
      ...(competencyId ? { competencyId } : {}),
      ...(Object.keys(scores).length ? { scores } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    if (kind === 'FILE' && !file) return setProblem(t('chooseFile'));
    if (kind === 'LINK' && !/^https:\/\//.test(url.trim())) return setProblem(t('httpsOnly'));
    try {
      await add.mutateAsync({
        resultId: row.resultId,
        input:
          kind === 'FILE'
            ? { kind: 'FILE', file: file!, ...common }
            : { kind: 'LINK', url: url.trim(), ...common },
      });
      toast.show({ tone: 'success', title: t('added') });
      onClose();
    } catch (err) {
      setProblem(errorMessage(err));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('addTitle', { name: row.fullName })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button loading={add.isPending || preparing} onClick={() => void submit()}>
            {t('save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">{t('kindLabel')}</legend>
          <div className="mt-1 flex gap-4">
            {(['FILE', 'LINK'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                {t(`kind.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === 'FILE' ? (
          <label
            htmlFor={fileId}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed p-6 text-center text-sm focus-within:ring-2 focus-within:ring-brand-600',
              dragging ? 'border-brand-600 bg-brand-50' : 'border-slate-300',
            )}
          >
            <span className="font-medium text-slate-900">{file ? file.name : t('dropzone')}</span>
            <span className="text-xs text-slate-600">
              {file ? t('size', { kb: Math.ceil(file.size / 1024) }) : t('dropzoneHint')}
            </span>
            <input
              id={fileId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => void pick(e.target.files?.[0])}
            />
          </label>
        ) : (
          <Input
            label={t('linkLabel')}
            hint={t('linkHint')}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        )}
        <Select
          label={t('competency')}
          value={competencyId}
          onChange={(e) => setCompetencyId(e.target.value)}
          options={[
            { value: '', label: t('noCompetency') },
            ...sheet.competencies.map((c) => ({ value: c.id, label: `${c.code} · ${c.title}` })),
          ]}
        />
        {sheet.rubric && (
          <fieldset>
            <legend className="text-sm font-medium text-slate-800">{t('scores')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {sheet.rubric.criteria.map((c) => (
                <Select
                  key={c.key}
                  label={c.name}
                  value={scores[c.key]?.toString() ?? ''}
                  onChange={(e) =>
                    setScores((s) => {
                      const next = { ...s };
                      if (e.target.value) next[c.key] = Number(e.target.value);
                      else delete next[c.key];
                      return next;
                    })
                  }
                  options={[
                    { value: '', label: t('notScored') },
                    ...sheet.rubric!.levels.map((l) => ({
                      value: String(l.value),
                      label: `${l.value} · ${l.label}`,
                    })),
                  ]}
                />
              ))}
            </div>
          </fieldset>
        )}
        <div>
          <label htmlFor={noteId} className="block text-sm font-medium text-slate-800">
            {t('note')}
          </label>
          <textarea
            id={noteId}
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-400 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
          />
        </div>
        {problem && (
          <p role="alert" className="text-sm text-red-700">
            {problem}
          </p>
        )}
      </div>
    </Modal>
  );
}
