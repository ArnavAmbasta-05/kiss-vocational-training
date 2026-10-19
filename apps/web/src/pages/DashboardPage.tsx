import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '../components/ui';
import { NAV_BY_ROLE } from '../components/layout/nav';
import { ApiStatusCard } from '../features/health/ApiStatusCard';
import { useAuth } from '../lib/auth';

const INTRO_KEY = { STUDENT: 'student.intro', TRAINER: 'trainer.intro', ADMIN: 'admin.intro' };

/** Role dashboard shell (BRQ-9.3). Key figures per role arrive with their features (Sprint 7). */
export function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'common']);
  const { user } = useAuth();
  if (!user) return null;
  const links = NAV_BY_ROLE[user.role].filter((item) => !item.end);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t('greeting', { name: user.fullName })}
        </h1>
        <p className="mt-2 max-w-2xl text-slate-700">{t(INTRO_KEY[user.role])}</p>
      </div>

      <section aria-labelledby="quick-links">
        <h2 id="quick-links" className="mb-3 text-lg font-semibold text-slate-900">
          {t('quickLinks')}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {links.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="block rounded-lg border border-slate-200 bg-white p-4 font-medium text-brand-800 shadow-sm hover:border-brand-300 hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
              >
                {t(`common:${item.labelKey}`)}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {user.role === 'ADMIN' && <ApiStatusCard />}
      {user.role !== 'ADMIN' && (
        <Card title={t('common:nav.profile')} headingLevel={2}>
          <p className="text-sm text-slate-700">
            {user.student?.rollNo ?? user.trainer?.employeeCode} · {user.email}
          </p>
        </Card>
      )}
    </div>
  );
}
