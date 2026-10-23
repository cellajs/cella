import i18n, { type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { appConfig } from 'shared';
import { z } from 'zod';
import { env } from '~/env';
import { locales } from '~/lib/i18n-locales';
import { formErrorMessage } from '~/utils/form-error-message';

/** i18n options: bundled preload for the default language, HTTP-loaded namespaces for the rest. */
const initOptions: InitOptions = {
  resources: locales, // Preload default ('en') translations
  debug: env.VITE_DEBUG_I18N,
  ns: ['c', 'about', 'error', 'appError'],
  partialBundledLanguages: true,
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // React escapes by default
  },
  react: { useSuspense: false },
  defaultNS: 'c',
  // Locale files are flat, and a dot belongs to the key (`docs` and `docs.openapi_specification` are both keys)
  keySeparator: false,
  backend: {
    // Processed namespaces (common + app merged into `c`), served by the vite plugin in dev and as build assets.
    loadPath: '/locales/{{lng}}/{{ns}}.json',
  },
};

i18n.use(Backend).use(LanguageDetector).use(initReactI18next);

// The page declares the language its text is in, so screen readers pronounce it right; an unsupported pick falls back
i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage ?? language;
});

i18n.init(initOptions);

// Every validation message in the user's language and in plain words; a message set on a schema still wins.
z.config({ customError: formErrorMessage });

// HMR for lazy-loaded locales (non-bundled languages and HTTP-loaded namespaces)
if (import.meta.hot) {
  import.meta.hot.on('i18next-hmr:update', () => {
    i18n.reloadResources().then(() => {
      i18n.emit('languageChanged', i18n.language);
    });
  });
}
