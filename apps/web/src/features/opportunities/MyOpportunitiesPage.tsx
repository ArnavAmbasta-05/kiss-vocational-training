import { useTranslation } from 'react-i18next';
import type { OpportunityMatch } from '@vtmp/shared';
import { Badge, Button, EmptyState, Spinner } from '../../components/ui';
import { useToast } from '../../components/toast';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatDay } from '../../lib/format';
import { useInterest, useMatches } from './api';

/** A ring showing the match %, with the number in text (colour is never the only cue). */
function MatchRing({ percent }: { percent: number }) {
  const { t } = useTranslation('opportunities');
  const r = 26;
  const c = 2 * Math.PI * r;
  const tone =
    percent >= 75 ? 'text-green-700' : percent >= 40 ? 'text-amber-600' : 'text-slate-500';
  return (
    <div
      className="relative h-16 w-16 shrink-0"
      role="img"
      aria-label={t('match', { percent: Math.round(percent) })}
    >
      <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90" aria-hidden="true">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-slate-200" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          stroke="currentColor"
          className={tone}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - percent / 100)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-900">
        {Math.round(percent)}%
      </span>
    </div>
  );
}

/**
 * Student: open internships, apprenticeships and jobs ranked by how many of their required skills
 * the student has verified (BR-22, BRQ-13.2), what is still missing with resources to close the
 * gap (BRQ-13.3), and an "I'm interested" toggle (BRQ-13.4).
 */
export function MyOpportunitiesPage() {
  const { t } = useTranslation('opportunities');
  const errorMessage = useErrorMessage();
  const matches = useMatches();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('mine.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-700">{t('mine.intro')}</p>
      </div>
      {matches.isPending ? (
        <Spinner size="lg" />
      ) : matches.isError ? (
        <EmptyState title={errorMessage(matches.error)} />
      ) : matches.data.length === 0 ? (
        <EmptyState title={t('mine.none')} />
      ) : (
        <ul className="flex flex-col gap-4" data-testid="matches">
          {matches.data.map((m) => (
            <MatchCard key={m.opportunity.id} m={m} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchCard({ m }: { m: OpportunityMatch }) {
  const { t, i18n } = useTranslation(['opportunities', 'competency']);
  const lng = i18n.resolvedLanguage ?? 'en';
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const interest = useInterest();
  const o = m.opportunity;

  const toggle = async () => {
    try {
      await interest.mutateAsync({ id: o.id, interested: !m.interested });
      toast.show({
        tone: 'success',
        title: m.interested ? t('mine.withdrawn') : t('mine.marked', { partner: o.partner }),
      });
    } catch (err) {
      toast.show({ tone: 'error', title: errorMessage(err) });
    }
  };

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <MatchRing percent={m.matchPercent} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">{o.title}</h2>
            <Badge tone="info">{t(`type.${o.type}`)}</Badge>
          </div>
          <p className="text-sm text-slate-700">
            {o.partner}
            {o.location ? ` · ${o.location}` : ''} · {o.role.title}
          </p>
          <p className="text-xs text-slate-600">
            {t('mine.skills', { verified: m.verified, required: m.required })} ·{' '}
            {t('mine.closes', { date: formatDay(o.closesOn, lng) })}
          </p>
          {o.description && <p className="mt-2 text-sm text-slate-700">{o.description}</p>}
        </div>
      </div>
      {m.missing.length > 0 && (
        <div className="mt-3 rounded-md bg-slate-50 p-3">
          <h3 className="text-sm font-semibold text-slate-900">{t('mine.missing')}</h3>
          <ul className="mt-1 flex flex-col gap-2 text-sm text-slate-800">
            {m.missing.map((x) => (
              <li key={x.code}>
                <span className="font-medium">{x.title ?? x.code}</span>{' '}
                <span className="text-xs text-slate-600">
                  {x.verifiedLevel
                    ? t('mine.levelFromTo', {
                        have: t(`competency:level.${x.verifiedLevel}`),
                        need: t(`competency:level.${x.requiredLevel}`),
                      })
                    : t('mine.levelNeeded', { need: t(`competency:level.${x.requiredLevel}`) })}
                </span>
                {x.resources.length > 0 && (
                  <ul className="mt-1 flex flex-wrap gap-2">
                    {x.resources.map((r) => (
                      <li key={r.id}>
                        <a
                          href={r.url ?? undefined}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-700 underline"
                        >
                          {r.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-3">
        <Button
          size="sm"
          variant={m.interested ? 'secondary' : 'primary'}
          aria-pressed={m.interested}
          loading={interest.isPending}
          onClick={() => void toggle()}
        >
          {m.interested ? t('mine.interested') : t('mine.markInterest')}
        </Button>
      </div>
    </li>
  );
}
