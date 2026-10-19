import { useTranslation } from 'react-i18next';
import type { Offering, WindowState } from '@vtmp/shared';
import { Badge, type BadgeTone } from '../../components/ui';
import { relativeTime } from '../../lib/format';

const TONE: Record<WindowState, BadgeTone> = {
  OPEN: 'success',
  UPCOMING: 'info',
  CLOSED: 'neutral',
  NOT_OFFERED: 'neutral',
};

/** Window state badge plus a relative countdown ("Closes in 3 days"). */
export function WindowBadge({ offering }: { offering: Offering | null }) {
  const { t, i18n } = useTranslation('courses');
  const state: WindowState = offering?.windowState ?? 'NOT_OFFERED';
  const lng = i18n.resolvedLanguage ?? 'en';
  let detail: string | null = null;
  if (offering && state === 'OPEN') {
    detail = t('window.closes', { when: relativeTime(offering.enrollmentClosesAt, lng) });
  } else if (offering && state === 'UPCOMING') {
    detail = t('window.opens', { when: relativeTime(offering.enrollmentOpensAt, lng) });
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Badge tone={TONE[state]}>{t(`window.${state}`)}</Badge>
      {detail && <span className="text-xs text-slate-600">{detail}</span>}
    </span>
  );
}
