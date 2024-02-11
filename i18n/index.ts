import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { config } from 'config';
import enBackend from './locales/en/backend.json';
import enFrontend from './locales/en/frontend.json';
import nlBackend from './locales/nl/backend.json';
import nlFrontend from './locales/nl/frontend.json';

export type { ParseKeys } from 'i18next';

export const defaultNS = 'frontend';

export const getI18n = (ns: 'frontend' | 'backend' = 'frontend') => {
  const i18n = i18next.use(LanguageDetector).use(initReactI18next);

  const initOptions: InitOptions = {
    ns: [ns],
    supportedLngs: config.languages.map((lng) => lng.value),
    load: 'languageOnly',
    fallbackLng: config.defaultLanguage,
    detection: {
      caches: ['cookie'],
    },
    defaultNS,
  };

  initOptions.resources = {
    en: { frontend: enFrontend, backend: enBackend },
    nl: { frontend: nlFrontend, backend: nlBackend },
  };

  i18n.init(initOptions);

  return i18n;
};
