import i18n, { type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { appConfig } from 'shared';
import { addI18nFormatters, i18nDefaultVariables } from 'shared/utils/i18n-text';
import { z } from 'zod';
import { env } from '~/env';
import { lazyLocaleBackend, locales } from '~/lib/i18n-locales';
import { formErrorMessage } from '~/utils/form-error-message';

/** i18n options: bundled preload for the default language, lazy hashed chunks for the rest. */
const initOptions: InitOptions = {
  resources: locales,
  debug: env.VITE_DEBUG_I18N,
  ns: ['c', 'about', 'error', 'appError'],
  partialBundledLanguages: true,
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // `t()` returns text, which React escapes
    defaultVariables: i18nDefaultVariables,
  },
  react: {
    useSuspense: false,
    // `Trans` parses its translation as markup, so it escapes interpolated values and unescapes the text after parsing
    transDefaultProps: { tOptions: { interpolation: { escapeValue: true } }, shouldUnescape: true },
  },
  defaultNS: 'c',
  // Locale files are flat, and a dot belongs to the key (`docs` and `docs.openapi_specification` are both keys)
  keySeparator: false,
};

i18n.use(lazyLocaleBackend).use(LanguageDetector).use(initReactI18next);

// The page declares the language its text is in, so screen readers pronounce it right; an unsupported pick falls back
i18n.on('languageChanged', (language) => {
  if (typeof document !== 'undefined') document.documentElement.lang = i18n.resolvedLanguage ?? language;
});

i18n.init(initOptions);
addI18nFormatters(i18n.services.formatter);

// Every validation message in the user's language and in plain words; a message set on a schema still wins.
z.config({ customError: formErrorMessage });
