import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ROLE_HOME, useAuth } from '../lib/auth';

export function ForbiddenPage() {
  const { t } = useTranslation(['errors', 'common']);
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="text-sm font-semibold text-brand-700">{t('errors:forbidden.code')}</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">{t('errors:forbidden.title')}</h1>
      <p className="mt-2 text-slate-700">{t('errors:forbidden.body')}</p>
      <Link
        to={user ? ROLE_HOME[user.role] : '/'}
        className="mt-6 inline-flex h-10 items-center rounded-md bg-brand-700 px-4 text-sm font-medium text-white hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      >
        {t('common:actions.goDashboard')}
      </Link>
    </div>
  );
}
