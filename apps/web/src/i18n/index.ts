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
    // Only what every screen and the app shell (header bell, account menu, sign-in) need is
    // fetched up front; a page's own namespace loads with the page (it suspends inside the
    // page, never the shell, so focus and layout stay put). Saves ~20 requests (NFR-10).
    ns: ['common', 'errors', 'auth', 'notifications'],
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

/**
 * Noto Sans Oriya / Devanagari (script-only subsets, self-hosted) load only when Odia or Hindi
 * is chosen, so English users never download them (BRQ-16.3, NFR-10). Without them the device's
 * own Odia or Devanagari font is used.
 */
const scriptFonts: Partial<Record<Locale, () => Promise<unknown[]>>> = {
  or: () =>
    Promise.all([
      import('@fontsource/noto-sans-oriya/oriya-400.css'),
      import('@fontsource/noto-sans-oriya/oriya-600.css'),
      import('@fontsource/noto-sans-oriya/oriya-700.css'),
    ]),
  hi: () =>
    Promise.all([
      import('@fontsource/noto-sans-devanagari/devanagari-400.css'),
      import('@fontsource/noto-sans-devanagari/devanagari-600.css'),
      import('@fontsource/noto-sans-devanagari/devanagari-700.css'),
    ]),
};
const loadedFonts = new Set<string>();

function applyLanguage(lng: string) {
  document.documentElement.lang = lng;
  if (isLocale(lng) && scriptFonts[lng] && !loadedFonts.has(lng)) {
    loadedFonts.add(lng);
    void scriptFonts[lng]!().catch(() => loadedFonts.delete(lng));
  }
}

i18n.on('languageChanged', applyLanguage);
if (i18n.resolvedLanguage) applyLanguage(i18n.resolvedLanguage);

export default i18n;
