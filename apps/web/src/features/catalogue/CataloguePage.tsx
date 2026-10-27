import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Badge, Card, EmptyState, Input, PageSkeleton, Select } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDay } from '../../lib/format';
import { useCatalogue, useCycles } from './api';
import { WindowBadge } from './WindowBadge';

/**
 * Student course catalogue (BRQ-2.2): the student first chooses a training cycle (nothing is
 * pre-selected), then sees its courses with seats, window state and countdown. The choice
 * lives in the address (?cycle=), so links, reloads and the back button keep it.
 */
export function CataloguePage() {
  const { t, i18n } = useTranslation('courses');
  const lng = i18n.resolvedLanguage ?? 'en';
  const errorMessage = useErrorMessage();
  const [params, setParams] = useSearchParams();
  const cycleId = params.get('cycle') ?? '';
  const cycles = useCycles();
  const { data, isPending, isError, error } = useCatalogue(cycleId || undefined);
  const inCycle = `cycle=${cycleId}`;
  const chooseCycle = (id: string) => {
    const next = new URLSearchParams(params);
    if (id) next.set('cycle', id);
    else next.delete('cycle');
    setParams(next);
  };
  const [search, setSearch] = useState('');
  const [openOnly, setOpenOnly] = useState(false);

  const courses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.courses ?? []).filter(
      (c) =>
        (!openOnly || c.offering?.windowState === 'OPEN') &&
        (!q || `${c.title} ${c.code} ${c.description}`.toLowerCase().includes(q)),
    );
  }, [data, search, openOnly]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('catalogue.title')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-700">{t('catalogue.intro')}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="sm:w-80">
          <Select
            label={t('catalogue.cycle')}
            value={cycleId}
            onChange={(e) => chooseCycle(e.target.value)}
            disabled={!cycles.data?.length}
            options={[
              { value: '', label: t('catalogue.chooseCycle') },
              ...(cycles.data ?? []).map((c) => ({
                value: c.id,
                label: t('catalogue.cycleOption', {
                  name: c.name,
                  from: formatDay(c.startsOn, lng),
                  to: formatDay(c.endsOn, lng),
                }),
              })),
            ]}
          />
        </div>
        <div className="sm:w-80">
          <Input
            label={t('catalogue.search')}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
            className="h-4 w-4 rounded border-slate-400 text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-600"
          />
          {t('catalogue.openOnly')}
        </label>
      </div>

      {cycles.isPending ? (
        <PageSkeleton />
      ) : cycles.isError ? (
        <EmptyState title={errorMessage(cycles.error)} />
      ) : cycles.data.length === 0 ? (
        <EmptyState title={t('catalogue.noCycle')} />
      ) : !cycleId ? (
        <EmptyState title={t('catalogue.pickCycle')} description={t('catalogue.pickCycleHint')} />
      ) : isPending ? (
        <PageSkeleton />
      ) : isError ? (
        <EmptyState title={errorMessage(error)} />
      ) : courses.length === 0 ? (
        <EmptyState title={t('catalogue.empty')} />
      ) : (
        <ul
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
          aria-label={t('catalogue.caption')}
        >
          {courses.map((c) => (
            <li key={c.id}>
              <Card className="flex h-full flex-col" title={c.title} headingLevel={2}>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-600">
                  {c.code}
                </p>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-slate-700">{c.description}</p>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-slate-600">{t('fields.duration')}</dt>
                    <dd className="font-medium text-slate-900">
                      {t('fields.durationValue', { count: c.durationWeeks })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-600">{t('fields.seatsRemaining')}</dt>
                    <dd>
                      {c.seatsRemaining > 0 ? (
                        <Badge tone={c.seatsRemaining <= 5 ? 'warning' : 'neutral'}>
                          {t('fields.seatsLeft', { count: c.seatsRemaining })}
                        </Badge>
                      ) : (
                        <Badge tone="danger">{t('fields.full')}</Badge>
                      )}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3">
                  <WindowBadge offering={c.offering} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    to={`/student/courses/${c.id}?${inCycle}`}
                    className="inline-flex h-9 items-center rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                    aria-label={`${t('catalogue.viewDetails')}: ${c.title}`}
                  >
                    {t('catalogue.viewDetails')}
                  </Link>
                  {c.offering?.windowState === 'OPEN' && (
                    <Link
                      to={`/student/enrollment/apply?courseId=${c.id}&${inCycle}`}
                      className="inline-flex h-9 items-center rounded-md bg-brand-700 px-3 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
                      aria-label={`${t('catalogue.applyNow')}: ${c.title}`}
                    >
                      {t('catalogue.applyNow')}
                    </Link>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
