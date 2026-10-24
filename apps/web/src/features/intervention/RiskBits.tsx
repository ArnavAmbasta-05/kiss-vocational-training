import { useTranslation } from 'react-i18next';
import type { RiskLevel, RiskReason } from '@vtmp/shared';
import { Badge, type BadgeTone } from '../../components/ui';
import { useReasonText } from './risk';

const TONE: Record<RiskLevel, BadgeTone> = { LOW: 'success', MEDIUM: 'warning', HIGH: 'danger' };

/** Level badge: the text carries the meaning, colour only supports it. */
export function LevelBadge({ level }: { level: RiskLevel }) {
  const { t } = useTranslation('intervention');
  return <Badge tone={TONE[level]}>{t(`level.${level}`)}</Badge>;
}

export function ReasonChips({ reasons }: { reasons: RiskReason[] }) {
  const text = useReasonText();
  if (reasons.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1">
      {reasons.map((r) => (
        <li key={`${r.code}-${r.competency ?? ''}`}>
          <Badge tone={r.level === 'HIGH' ? 'danger' : 'warning'}>{text(r)}</Badge>
        </li>
      ))}
    </ul>
  );
}
