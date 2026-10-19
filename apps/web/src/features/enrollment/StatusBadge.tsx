import { useTranslation } from 'react-i18next';
import type { EnrollmentStatus } from '@vtmp/shared';
import { Badge, type BadgeTone } from '../../components/ui';

const TONE: Record<EnrollmentStatus, BadgeTone> = {
  PENDING: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
  WAITLISTED: 'warning',
  ALLOCATED: 'success',
  ACTIVE: 'success',
  COMPLETED: 'success',
  NOT_COMPLETED: 'danger',
  CERTIFIED: 'success',
  WITHDRAWN: 'neutral',
};

export function StatusBadge({ status }: { status: EnrollmentStatus }) {
  const { t } = useTranslation('enrollment');
  return <Badge tone={TONE[status]}>{t(`status.${status}`)}</Badge>;
}
