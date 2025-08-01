import { appConfig } from 'config';
import i18n, { type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { env } from '~/env';
import locales from '~/lib/i18n-locales';

export type { ParseKeys } from 'i18next';

/**
 * i18n options with hybrid preload and lazy loading strategy
 */
const initOptions: InitOptions = {
  resources: locales, // Preload default ('en') translations
  debug: env.VITE_DEBUG_I18N,
  ns: ['common', 'app', 'about', 'error'],
  partialBundledLanguages: true,
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // React escapes by default
  },
  react: {
    useSuspense: false,
  },
  defaultNS: 'common',
  backend: {
    loadPath: '/locales/{{lng}}/{{ns}}.json',
  },
};

// Init i18n instance
i18n.use(Backend).use(LanguageDetector).use(initReactI18next).init(initOptions);
