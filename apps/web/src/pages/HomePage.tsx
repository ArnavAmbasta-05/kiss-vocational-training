import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui';
import { ApiStatusCard } from '../features/health/ApiStatusCard';

const roles = ['student', 'trainer', 'admin'] as const;

export function HomePage() {
  const { t } = useTranslation('home');
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
        <p className="mt-2 max-w-2xl text-slate-700">{t('intro')}</p>
      </div>

      <ApiStatusCard />

      <section aria-labelledby="roles-heading">
        <h2 id="roles-heading" className="mb-3 text-lg font-semibold text-slate-900">
          {t('roles.title')}
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {roles.map((role) => (
            <Card key={role} title={t(`roles.${role}.title`)} headingLevel={3}>
              <p className="text-sm text-slate-700">{t(`roles.${role}.body`)}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
