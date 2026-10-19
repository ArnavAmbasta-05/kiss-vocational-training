import { useTranslation } from 'react-i18next';
import type { BatchStatus } from '@vtmp/shared';
import { Badge, type BadgeTone } from '../../components/ui';

const TONE: Record<BatchStatus, BadgeTone> = {
  PLANNED: 'info',
  ACTIVE: 'success',
  CLOSED: 'neutral',
};

export function BatchStatusBadge({ status }: { status: BatchStatus }) {
  const { t } = useTranslation('batches');
  return <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>;
}

/** Capacity bar with the numbers in text, so it never relies on colour alone. */
export function FillBar({
  existing,
  added = 0,
  capacity,
}: {
  existing: number;
  added?: number;
  capacity: number;
}) {
  const { t } = useTranslation('batches');
  const total = existing + added;
  const pct = (n: number) => `${Math.min(100, (n / Math.max(capacity, 1)) * 100)}%`;
  return (
    <div className="min-w-32">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="bg-brand-700" style={{ width: pct(existing) }} />
        {added > 0 && <div className="bg-green-600" style={{ width: pct(added) }} />}
      </div>
      <p className="mt-1 text-xs text-slate-700">
        {t('fields.fill', { enrolled: total, capacity })}
      </p>
    </div>
  );
}
