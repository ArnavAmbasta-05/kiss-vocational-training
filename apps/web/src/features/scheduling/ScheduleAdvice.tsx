import { useTranslation } from 'react-i18next';
import type { BatchScheduleAdvice, CapacityLevel } from '@vtmp/shared';
import { Badge, Card, EmptyState, Spinner, type BadgeTone } from '../../components/ui';
import { useErrorMessage } from '../../lib/api/useErrorMessage';
import { formatSessionDate, formatSessionTime } from '../../lib/format';
import { useScheduleAdvice } from './api';

const TONE: Record<CapacityLevel, BadgeTone> = { OK: 'success', NEAR: 'warning', OVER: 'danger' };

/**
 * Inside the allocation preview (BRQ-14.1–14.3): for each batch, how full it will be, who
 * teaches it, any venue or trainer clashes of its upcoming sessions, and free trainers to assign.
 */
export function ScheduleAdvicePanel({
  fills,
}: {
  fills: Array<{ batchId: string; added: number }>;
}) {
  const { t } = useTranslation('scheduling');
  const errorMessage = useErrorMessage();
  const advice = useScheduleAdvice(
    fills.length
      ? { batches: fills.map((f) => ({ batchId: f.batchId, addStudents: f.added })) }
      : null,
  );

  return (
    <Card title={t('panel.title')} data-testid="schedule-advice">
      <p className="mb-3 text-sm text-slate-700">{t('panel.intro')}</p>
      {advice.isPending ? (
        <Spinner />
      ) : advice.isError ? (
        <EmptyState title={errorMessage(advice.error)} />
      ) : (
        <ul className="flex flex-col divide-y divide-slate-100">
          {advice.data.batches.map((b) => (
            <BatchAdvice key={b.batchId} advice={b} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BatchAdvice({ advice: b }: { advice: BatchScheduleAdvice }) {
  const { t, i18n } = useTranslation('scheduling');
  const lng = i18n.resolvedLanguage ?? 'en';
  const hard = b.clashes.filter((c) => c.hard);
  const soft = b.clashes.filter((c) => !c.hard);
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">{b.batchName}</span>
        <Badge tone={TONE[b.capacity.level]}>
          {t(`capacity.${b.capacity.level}`, {
            projected: b.capacity.projected,
            capacity: b.capacity.capacity,
            percent: b.capacity.percent,
          })}
        </Badge>
        {hard.length > 0 && <Badge tone="danger">{t('clash.hard', { count: hard.length })}</Badge>}
        {soft.length > 0 && <Badge tone="warning">{t('clash.soft', { count: soft.length })}</Badge>}
      </div>
      <p className="mt-1 text-sm text-slate-700">
        {b.trainers.length
          ? t('trainers.assigned', { names: b.trainers.map((x) => x.fullName).join(', ') })
          : t('trainers.none')}
      </p>
      {b.clashes.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
          {b.clashes.slice(0, 5).map((c, i) => (
            <li key={`${c.with.sessionId}-${c.kind}-${i}`}>
              {t(`clash.${c.kind}`, {
                date: formatSessionDate(c.session.startsAt, lng),
                time: formatSessionTime(c.session.startsAt, c.session.endsAt, lng),
                other: c.with.batchName,
                venue: c.with.venue,
                trainer: c.trainer?.fullName ?? '',
              })}
            </li>
          ))}
          {b.clashes.length > 5 && <li>{t('clash.more', { count: b.clashes.length - 5 })}</li>}
        </ul>
      )}
      {b.suggestions.trainers.length > 0 && (
        <p className="mt-1 text-xs text-slate-700">
          {t('trainers.free', {
            names: b.suggestions.trainers
              .map((x) => (x.specialization ? `${x.fullName} (${x.specialization})` : x.fullName))
              .join(', '),
          })}
        </p>
      )}
    </li>
  );
}
