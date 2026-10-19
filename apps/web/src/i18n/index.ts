import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import resourcesToBackend from 'i18next-resources-to-backend';
import { initReactI18next } from 'react-i18next';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@vtmp/shared';

/**
 * Locale files live at src/locales/<lng>/<namespace>.json. Adding a language or a namespace
 * is a file change only (NFR-11). Each file is its own chunk, loaded on demand.
 */
const localeFiles = import.meta.glob<{ default: Record<string, unknown> }>('../locales/*/*.json');

export const NAMESPACES = [
  ...new Set(Object.keys(localeFiles).map((p) => p.split('/').pop()!.replace('.json', ''))),
];

export function isLocale(value: string | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

void i18n
  .use(
    resourcesToBackend(async (lng: string, ns: string) => {
      const load = localeFiles[`../locales/${lng}/${ns}.json`];
      return load ? (await load()).default : {};
    }),
  )
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    supportedLngs: [...LOCALES],
    fallbackLng: DEFAULT_LOCALE,
    load: 'languageOnly',
    ns: NAMESPACES,
    defaultNS: 'common',
    // Untranslated strings are "" in or/hi files; fall back to English instead of blank.
    returnEmptyString: false,
    interpolation: { escapeValue: false }, // React already escapes output.
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'vtmp.locale',
      caches: ['localStorage'],
    },
  });

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
});

export default i18n;
