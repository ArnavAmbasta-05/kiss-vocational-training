import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES, type Locale, type Me } from '@vtmp/shared';
import { api } from '../../lib/api/client';
import { useAuth } from '../../lib/auth';
import { cn } from '../ui';

/** Switches the UI language; when signed in the choice is saved to the profile (User.locale). */
export function LanguageSwitcher({ tone = 'dark' }: { tone?: 'dark' | 'light' }) {
  const { t, i18n } = useTranslation();
  const { user, setUser } = useAuth();
  const id = useId();

  const change = (lng: Locale) => {
    void i18n.changeLanguage(lng);
    if (user && user.locale !== lng) {
      // Best effort: the UI has already switched, a failed save only affects the next login.
      api
        .patch<Me>('/users/me', { locale: lng })
        .then(setUser)
        .catch(() => undefined);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {t('language.label')}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage ?? 'en'}
        onChange={(e) => change(e.target.value as Locale)}
        data-testid="language-switcher"
        className={cn(
          'h-9 rounded-md border px-2 text-sm focus-visible:outline-none focus-visible:ring-2',
          tone === 'dark'
            ? 'border-white/40 bg-brand-800 text-white focus-visible:ring-white'
            : 'border-slate-400 bg-white text-slate-900 focus-visible:ring-brand-600',
        )}
      >
        {LOCALES.map((lng) => (
          // lang lets screen readers pronounce each endonym correctly.
          <option key={lng} value={lng} lang={lng}>
            {t(`language.${lng}`)}
          </option>
        ))}
      </select>
    </div>
  );
}
