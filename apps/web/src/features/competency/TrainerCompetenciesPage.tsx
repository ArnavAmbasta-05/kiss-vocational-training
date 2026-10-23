import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PROFICIENCY_LEVELS, type HeatmapCell, type RatingGrid } from '@vtmp/shared';
import { Button, EmptyState, Select, Spinner, Tabs, cn } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useMyBatches } from '../batches/api';
import { useHeatmap, useRatingGrid, useSaveRatings } from './api';
import { ResourceLibrary } from './ResourceLibrary';

/** Trainer: rate and verify competencies (BRQ-C.2, BR-13), batch heatmap (BRQ-12.4). */
export function TrainerCompetenciesPage() {
  const { t } = useTranslation('competency');
  const errorMessage = useErrorMessage();
  const batches = useMyBatches();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('ratings');

  if (batches.isPending) return <Spinner size="lg" />;
  if (batches.isError) return <EmptyState title={errorMessage(batches.error)} />;
  const list = batches.data.filter((b) => b.status !== 'PLANNED');
  const selected =
    list.find((b) => b.id === params.get('batch')) ??
    list.find((b) => b.status === 'ACTIVE') ??
    list[0];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('trainer.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('trainer.intro')}</p>
      </div>
      {!selected ? (
        <EmptyState title={t('trainer.noBatches')} />
      ) : (
        <>
          <div className="w-80 max-w-full">
            <Select
              label={t('trainer.batch')}
              value={selected.id}
              onChange={(e) => setParams({ batch: e.target.value }, { replace: true })}
              options={list.map((b) => ({ value: b.id, label: `${b.courseTitle} · ${b.name}` }))}
            />
          </div>
          <Tabs
            label={t('trainer.tabs.label')}
            selected={tab}
            onSelect={setTab}
            items={[
              {
                id: 'ratings',
                label: t('trainer.tabs.ratings'),
                content: <RatingsGrid key={selected.id} batchId={selected.id} />,
              },
              {
                id: 'heatmap',
                label: t('trainer.tabs.heatmap'),
                content: <HeatmapView batchId={selected.id} />,
              },
              {
                id: 'resources',
                label: t('trainer.tabs.resources'),
                content: <ResourceLibrary courseId={selected.courseId} headingLevel={2} />,
              },
            ]}
          />
        </>
      )}
    </div>
  );
}

type Draft = Record<string, { level: number; verify: boolean }>;
const key = (studentId: string, competencyId: string) => `${studentId}:${competencyId}`;

function RubricLegend() {
  const { t } = useTranslation('competency');
  return (
    <dl className="grid gap-x-6 gap-y-1 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 sm:grid-cols-2">
      {PROFICIENCY_LEVELS.map((l) => (
        <div key={l}>
          <dt className="inline font-semibold text-slate-900">{t(`level.${l}`)}: </dt>
          <dd className="inline">{t(`rubric.${l}`)}</dd>
        </div>
      ))}
    </dl>
  );
}

function RatingsGrid({ batchId }: { batchId: string }) {
  const { t } = useTranslation('competency');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const grid = useRatingGrid(batchId);
  const save = useSaveRatings();
  const [draft, setDraft] = useState<Draft>({});

  const saved = useMemo(() => {
    const m: Record<string, RatingGrid['ratings'][number]> = {};
    for (const r of grid.data?.ratings ?? []) m[key(r.studentId, r.competencyId)] = r;
    return m;
  }, [grid.data]);

  useEffect(() => setDraft({}), [grid.data]);

  if (grid.isPending) return <Spinner />;
  if (grid.isError) return <EmptyState title={errorMessage(grid.error)} />;
  const g = grid.data;
  if (g.competencies.length === 0) return <EmptyState title={t('grid.noCompetencies')} />;

  const changes = Object.entries(draft).filter(([k, d]) => {
    const s = saved[k];
    return !s || s.level !== d.level || (d.verify && !s.verified);
  });

  const onSave = async () => {
    if (changes.length === 0) return toast.show({ tone: 'info', title: t('grid.nothing') });
    try {
      await save.mutateAsync({
        batchId,
        input: {
          ratings: changes.map(([k, d]) => {
            const [studentId, competencyId] = k.split(':') as [string, string];
            return {
              studentId,
              competencyId,
              level: d.level,
              ...(d.verify ? { verify: true } : {}),
            };
          }),
        },
      });
      toast.show({ tone: 'success', title: t('grid.saved', { count: changes.length }) });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <RubricLegend />
      {!g.editable && <p className="text-sm text-slate-700">{t('grid.readOnly')}</p>}
      <div
        role="region"
        aria-label={t('grid.caption')}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border border-slate-200"
      >
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <caption className="sr-only">{t('grid.caption')}</caption>
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700"
              >
                {t('grid.student')}
              </th>
              {g.competencies.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-[10.5rem] px-2 py-2 text-left align-bottom font-semibold text-slate-700"
                >
                  <span className="font-mono">{c.code}</span>
                  <span className="block text-xs font-normal text-slate-600">{c.title}</span>
                  <span className="block text-xs font-normal text-slate-600">
                    {t('grid.required', { level: c.requiredLevel })}
                    {c.isMandatory ? ` · ${t('mandatory')}` : ''}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {g.students.map((s) => (
              <tr key={s.studentId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[10rem] bg-white px-3 py-2 text-left font-medium text-slate-900"
                >
                  {s.fullName}
                  <span className="block text-xs font-normal text-slate-600">{s.rollNo}</span>
                </th>
                {g.competencies.map((c) => {
                  const k = key(s.studentId, c.id);
                  const cur = saved[k];
                  const d = draft[k];
                  const level = d?.level ?? cur?.level ?? 0;
                  const verified = cur?.verified ?? false;
                  const canVerify = !verified && level >= c.requiredLevel;
                  return (
                    <td key={c.id} className="px-2 py-2 align-top">
                      <label className="sr-only" htmlFor={`lvl-${k}`}>
                        {t('grid.levelFor', { name: s.fullName, code: c.code })}
                      </label>
                      <select
                        id={`lvl-${k}`}
                        value={level || ''}
                        disabled={!g.editable}
                        onChange={(e) =>
                          setDraft((x) => ({
                            ...x,
                            [k]: { level: Number(e.target.value), verify: false },
                          }))
                        }
                        className="w-full rounded-md border border-slate-400 px-2 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 disabled:bg-slate-50"
                      >
                        <option value="" disabled>
                          {t('grid.notRated')}
                        </option>
                        {PROFICIENCY_LEVELS.map((l) => (
                          <option
                            key={l}
                            value={l}
                            title={`${t(`level.${l}`)}: ${t(`rubric.${l}`)}`}
                          >
                            {t(`level.${l}`)}
                          </option>
                        ))}
                      </select>
                      {verified ? (
                        <span className="mt-1 block text-xs font-medium text-green-800">
                          ✓ {t('verified')}
                        </span>
                      ) : (
                        g.editable &&
                        canVerify && (
                          <label className="mt-1 flex items-center gap-1 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={!!d?.verify}
                              aria-label={t('grid.verifyFor', { code: c.code, name: s.fullName })}
                              onChange={(e) =>
                                setDraft((x) => ({
                                  ...x,
                                  [k]: { level, verify: e.target.checked },
                                }))
                              }
                            />
                            {t('grid.verify')}
                          </label>
                        )
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {g.editable && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void onSave()} loading={save.isPending}>
            {t('grid.save')}
          </Button>
          <span className="text-xs text-slate-600">{t('grid.verifyHint')}</span>
        </div>
      )}
    </div>
  );
}

/** Colour and text together, so the heatmap never relies on colour alone. */
function tone(c: HeatmapCell) {
  if (c.source === 'NOT_ASSESSED') return 'bg-slate-100 text-slate-700';
  if (c.gap === 0) return 'bg-green-100 text-green-900';
  if (c.gap === 1) return 'bg-amber-100 text-amber-900';
  return 'bg-red-100 text-red-900';
}

function HeatmapView({ batchId }: { batchId: string }) {
  const { t } = useTranslation('competency');
  const errorMessage = useErrorMessage();
  const hm = useHeatmap(batchId);
  if (hm.isPending) return <Spinner />;
  if (hm.isError) return <EmptyState title={errorMessage(hm.error)} />;
  const h = hm.data;
  if (h.competencies.length === 0) return <EmptyState title={t('grid.noCompetencies')} />;

  const belowBy = h.competencies.map((_, i) => h.rows.filter((r) => r.cells[i]?.below).length);
  const legend = [
    { cls: 'bg-green-100 text-green-900', label: t('heatmap.met') },
    { cls: 'bg-amber-100 text-amber-900', label: t('heatmap.gap1') },
    { cls: 'bg-red-100 text-red-900', label: t('heatmap.gap2') },
    { cls: 'bg-slate-100 text-slate-700', label: t('heatmap.notAssessed') },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div aria-label={t('heatmap.legend')} role="group" className="flex flex-wrap gap-2 text-xs">
        {legend.map((l) => (
          <span key={l.label} className={cn('rounded px-2 py-1 font-medium', l.cls)}>
            {l.label}
          </span>
        ))}
        <span className="rounded px-2 py-1 text-slate-700">* {t('heatmap.provisional')}</span>
      </div>
      <div
        role="region"
        aria-label={t('heatmap.caption')}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard-reachable
        tabIndex={0}
        className="relative overflow-x-auto rounded-lg border border-slate-200"
      >
        <table className="min-w-full text-sm">
          <caption className="sr-only">{t('heatmap.caption')}</caption>
          <thead className="bg-slate-50">
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700"
              >
                {t('grid.student')}
              </th>
              {h.competencies.map((c, i) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-[6.5rem] px-2 py-2 text-left align-bottom font-semibold text-slate-700"
                >
                  <abbr title={c.title} className="font-mono no-underline">
                    {c.code}
                  </abbr>
                  <span className="block text-xs font-normal text-slate-600">
                    {t('grid.required', { level: c.requiredLevel })}
                  </span>
                  <span
                    className={cn(
                      'block text-xs font-normal',
                      belowBy[i] ? 'text-red-800' : 'text-slate-600',
                    )}
                  >
                    {t('heatmap.belowCount', { count: belowBy[i] })}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {h.rows.map((r) => (
              <tr key={r.studentId} className="border-t border-slate-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-[10rem] bg-white px-3 py-2 text-left font-medium text-slate-900"
                >
                  {r.fullName}
                  <span className="block text-xs font-normal text-slate-600">{r.rollNo}</span>
                </th>
                {r.cells.map((c) => (
                  <td key={c.competencyId} className="p-1" data-below={c.below || undefined}>
                    <span className={cn('block rounded px-2 py-1.5 text-xs font-medium', tone(c))}>
                      {c.level === null ? (
                        t('heatmap.na')
                      ) : (
                        <>
                          {t('heatmap.levelShort', { level: c.level })}
                          {c.source === 'PROVISIONAL' ? '*' : ''}
                          {c.verified ? ' ✓' : ''}
                          {c.gap > 0 ? ` · ${t('heatmap.gapShort', { gap: c.gap })}` : ''}
                        </>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
