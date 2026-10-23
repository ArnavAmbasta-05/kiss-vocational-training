import { useTranslation } from 'react-i18next';
import type { CompetencyStanding, GapItem } from '@vtmp/shared';
import { Badge, Card, EmptyState, Spinner } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { useMyGaps } from './api';

/** Student: required vs demonstrated per competency, gaps ranked with what to practise (F12). */
export function MySkillGapsPage() {
  const { t } = useTranslation('competency');
  const errorMessage = useErrorMessage();
  const { data, isPending, isError, error } = useMyGaps();
  if (isPending) return <Spinner size="lg" />;
  if (isError) return <EmptyState title={errorMessage(error)} />;

  const empty =
    !data.batch || data.belowLevel.length + data.notAssessed.length + data.met.length === 0;
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('gaps.title')}</h1>
        <p className="mt-1 text-sm text-slate-700">{t('gaps.intro')}</p>
        {data.batch && (
          <p className="mt-1 text-sm font-medium text-slate-800">{`${data.batch.courseTitle} · ${data.batch.name}`}</p>
        )}
      </div>
      {empty ? (
        <EmptyState title={t('gaps.none')} />
      ) : (
        <>
          <Card title={t('gaps.below')} headingLevel={2} data-testid="gaps-below">
            {data.belowLevel.length === 0 ? (
              <p className="text-sm text-slate-700">{t('gaps.belowEmpty')}</p>
            ) : (
              <ol className="flex flex-col gap-4">
                {data.belowLevel.map((g) => (
                  <GapRow key={g.competencyId} g={g} />
                ))}
              </ol>
            )}
          </Card>
          {data.notAssessed.length > 0 && (
            <Card title={t('gaps.notAssessed')} headingLevel={2}>
              <p className="-mt-2 mb-3 text-xs text-slate-600">{t('gaps.notAssessedHint')}</p>
              <ol className="flex flex-col gap-4">
                {data.notAssessed.map((g) => (
                  <GapRow key={g.competencyId} g={g} />
                ))}
              </ol>
            </Card>
          )}
          <Card title={t('gaps.met')} headingLevel={2}>
            {data.met.length === 0 ? (
              <p className="text-sm text-slate-700">{t('gaps.metEmpty')}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {data.met.map((s) => (
                  <li key={s.competencyId}>
                    <Heading s={s} />
                    <LevelBar s={s} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Heading({ s }: { s: CompetencyStanding }) {
  const { t } = useTranslation('competency');
  return (
    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
      <span className="font-mono text-xs text-slate-600">{s.code}</span>
      {s.title}
      {s.isMandatory && <Badge tone="info">{t('mandatory')}</Badge>}
      {s.verified && <Badge tone="success">✓ {t('verified')}</Badge>}
      {s.source === 'PROVISIONAL' && <Badge tone="neutral">{t('source.PROVISIONAL')}</Badge>}
    </p>
  );
}

/** Required vs demonstrated as a bar out of 4, with both figures also in text. */
function LevelBar({ s }: { s: CompetencyStanding }) {
  const { t } = useTranslation('competency');
  const have = s.demonstratedLevel ?? 0;
  return (
    <div className="mt-1">
      <div
        role="meter"
        aria-label={s.title}
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={have}
        aria-valuetext={t('gaps.progress', { have, need: s.requiredLevel })}
        className="relative h-2.5 w-full max-w-sm rounded-full bg-slate-200"
      >
        <div
          className={
            s.gap === 0 ? 'h-full rounded-full bg-green-700' : 'h-full rounded-full bg-amber-500'
          }
          style={{ width: `${(have / 4) * 100}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute -top-1 w-0.5 bg-slate-900"
          style={{ left: `calc(${(s.requiredLevel / 4) * 100}% - 1px)`, height: '1.125rem' }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-700">
        {t('gaps.required', { level: s.requiredLevel })} ·{' '}
        {s.demonstratedLevel === null
          ? t('gaps.demonstratedNone')
          : t('gaps.demonstrated', { level: s.demonstratedLevel })}
        {s.gap > 0 && (
          <strong className="ml-1 text-slate-900">· {t('gaps.gap', { count: s.gap })}</strong>
        )}
      </p>
    </div>
  );
}

function GapRow({ g }: { g: GapItem }) {
  const { t } = useTranslation('competency');
  return (
    <li data-testid={`gap-${g.code}`}>
      <Heading s={g} />
      <LevelBar s={g} />
      <div className="mt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          {t('gaps.recommended')}
        </p>
        {g.recommendations.length === 0 ? (
          <p className="text-sm text-slate-700">{t('gaps.noRecommendations')}</p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {g.recommendations.map((r) => (
              <li key={r.id} className="text-sm">
                <Badge tone="neutral">{t(`resourceType.${r.type}`)}</Badge>{' '}
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-700 underline hover:text-brand-900"
                >
                  {r.title}
                </a>
                <span className="sr-only"> {t('gaps.opensNewTab')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}
