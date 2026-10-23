import { Suspense, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Spinner, cn } from '../ui';
import { LanguageSwitcher } from './LanguageSwitcher';
import { Sidebar } from './Sidebar';
import { useAuth } from '../../lib/auth';
import { NAV_BY_ROLE } from './nav';
import { NotificationBell } from '../../features/notifications/NotificationBell';
import { UserMenu } from './UserMenu';

/**
 * Accessible app shell: skip link → top bar (name, language, account) → role sidebar + main.
 * On small screens the sidebar is a toggleable panel; from md up it is always visible.
 */
export function AppShell() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const nav = user ? NAV_BY_ROLE[user.role] : [];
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    document.title = t('appName');
  }, [t, i18n.resolvedLanguage]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-white px-4 py-2 font-medium text-brand-800 focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:shadow-lg"
      >
        {t('skipToContent')}
      </a>

      <header className="sticky top-0 z-40 bg-brand-700 text-white shadow">
        <div className="flex h-14 items-center gap-3 px-4">
          <button
            type="button"
            className="rounded-md p-2 hover:bg-brand-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:hidden"
            aria-expanded={menuOpen}
            aria-controls="app-sidebar"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span aria-hidden="true" className="block text-lg leading-none">
              ☰
            </span>
            <span className="sr-only">{menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}</span>
          </button>
          <Link
            to="/"
            className="flex min-w-0 items-baseline gap-2 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span className="text-lg font-bold tracking-tight">{t('appName')}</span>
            <span className="hidden truncate text-sm text-brand-100 lg:inline">
              {t('appFullName')}
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher />
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          id="app-sidebar"
          className={cn(
            'w-64 shrink-0 border-r border-slate-200 bg-white',
            'fixed inset-y-14 left-0 z-30 md:static md:block',
            menuOpen ? 'block' : 'hidden',
          )}
        >
          <Sidebar items={nav} onNavigate={() => setMenuOpen(false)} />
        </aside>

        <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <Suspense fallback={<Spinner size="lg" />}>
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-white px-4 py-3 text-center text-xs text-slate-600">
        {t('footer.institution')}
      </footer>
    </div>
  );
}
