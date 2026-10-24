import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState } from '../../components/ui';
import { formatDay } from '../../lib/format';
import { useMyRisk, useRiskFlags } from './api';
import { LevelBadge } from './RiskBits';
import { daysSince } from './risk';

/**
 * BRQ-11.5: the student's own flag, in supportive words — what to work on and what was agreed.
 * Never alarming: no level badge, no "risk" wording. Nothing renders when there is no flag.
 */
export function MyRiskCard() {
  const { t, i18n } = useTranslation('intervention');
  const lng = i18n.resolvedLanguage ?? 'en';
  const nf = new Intl.NumberFormat(lng, { maximumFractionDigits: 2 });
  const { data } = useMyRisk();
  if (!data || data.length === 0) return null;

  return (
    <>
      {data.map((f) => (
        <Card
          key={f.id}
          title={t('student.title')}
          headingLevel={2}
          className="border-brand-200 bg-brand-50"
          data-testid="my-risk-card"
        >
          <p className="text-sm text-slate-800">
            {f.clearSince ? t('student.improving') : t('student.intro', { batch: f.batch.name })}
          </p>
          <ul className="mt-3 list-disc pl-5 text-sm text-slate-800">
            {f.reasons.map((r) => (
              <li key={`${r.code}-${r.competency ?? ''}`}>
                {t(`student.reasons.${r.code}`, {
                  actual: nf.format(r.actual),
                  threshold: nf.format(r.threshold),
                  competency: r.competency ?? '',
                })}
              </li>
            ))}
          </ul>
          {f.actions.length > 0 && (
            <>
              <h3 className="mt-4 text-sm font-semibold text-slate-900">{t('student.plan')}</h3>
              <ul className="mt-1 flex flex-col gap-1 text-sm text-slate-800">
                {f.actions.map((a) => (
                  <li key={a.id}>
                    {t('student.action', {
                      type: t(`actionType.${a.type}`),
                      owner: a.owner,
                      date: formatDay(a.dueOn, lng),
                    })}
                    {a.completedAt && ` · ${t('student.done')}`}
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="mt-4 text-sm text-slate-700">{t('student.help')}</p>
        </Card>
      ))}
    </>
  );
}

/** Admin dashboard: High flags unresolved past the escalation period (BR-17). */
export function EscalationsWidget() {
  const { t } = useTranslation('intervention');
  const { data } = useRiskFlags({ escalated: true, status: 'OPEN', page: 1, pageSize: 5 });
  return (
    <Card
      title={t('escalations.title')}
      headingLevel={2}
      data-testid="escalations"
      actions={
        <Link
          to="/admin/at-risk"
          className="text-sm text-brand-700 underline-offset-2 hover:underline"
        >
          {t('escalations.all')}
        </Link>
      }
    >
      {!data || data.data.length === 0 ? (
        <EmptyState title={t('escalations.none')} />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {data.data.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <Link
                to={`/admin/at-risk/${f.id}`}
                className="font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                {f.student.fullName}
                <span className="block text-xs font-normal text-slate-600">{f.batch.name}</span>
              </Link>
              <span className="flex items-center gap-2 text-xs text-slate-700">
                <LevelBadge level={f.level} />
                {t('list.days', { count: daysSince(f.openedAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && data.meta.total > data.data.length && (
        <p className="mt-2 text-xs text-slate-600">
          {t('escalations.more', { count: data.meta.total - data.data.length })}
        </p>
      )}
    </Card>
  );
}
