import { useTranslation } from 'react-i18next';
import type { RiskReason } from '@vtmp/shared';

/** The staff wording for one reason, with its figures. */
export function useReasonText() {
  const { t, i18n } = useTranslation('intervention');
  const nf = new Intl.NumberFormat(i18n.resolvedLanguage ?? 'en', { maximumFractionDigits: 2 });
  return (r: RiskReason) =>
    t(`reasons.${r.code}`, {
      actual: nf.format(r.actual),
      threshold: nf.format(r.threshold),
      competency: r.competency ?? '',
    });
}

/** Whole days since an instant. */
export const daysSince = (iso: string, now = Date.now()) =>
  Math.max(0, Math.floor((now - new Date(iso).getTime()) / 86_400_000));
