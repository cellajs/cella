import i18n, { type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import about from '../../../locales/en/about.json';
import app from '../../../locales/en/app.json';
import common from '../../../locales/en/common.json';

import { config } from 'config';
import { env } from '../../env';

export type { ParseKeys } from 'i18next';

// Set up i18n with hybrid preload and lazy loading strategy
const initOptions: InitOptions = {
  resources: { en: { common, app, about } }, // Preload default ('en') translations
  debug: env.VITE_DEBUG_I18N,
  ns: ['common', 'app', 'about'],
  partialBundledLanguages: true,
  supportedLngs: config.languages.map((lng) => lng.value),
  load: 'languageOnly',
  fallbackLng: config.defaultLanguage,
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

export { i18n };
