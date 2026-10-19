import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui';

/** Placeholder for navigation items whose feature arrives in a later sprint. */
export function ComingSoonPage({ titleKey }: { titleKey: string }) {
  const { t } = useTranslation(['common', 'dashboard']);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-slate-900">{t(titleKey)}</h1>
      <EmptyState
        title={t('dashboard:comingSoon.title')}
        description={t('dashboard:comingSoon.body')}
      />
    </div>
  );
}
