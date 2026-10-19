import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { LOCALES } from '@vtmp/shared';

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {t('language.label')}
      </label>
      <select
        id={id}
        value={i18n.resolvedLanguage ?? 'en'}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
        data-testid="language-switcher"
        className="h-9 rounded-md border border-white/40 bg-brand-800 px-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
