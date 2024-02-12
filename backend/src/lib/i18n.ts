import i18n, { InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { config } from 'config';

export type { ParseKeys } from 'i18next';

import enBackend from '../../../locales/en/backend.json';
import enCommon from '../../../locales/en/common.json';
import nlBackend from '../../../locales/nl/backend.json';
import nlCommon from '../../../locales/nl/common.json';

// Set up i18n with lazy loading strategy
const initOptions: InitOptions = {
  resources: {
    en: { backend: enBackend, common: enCommon },
    nl: { backend: nlBackend, common: nlCommon },
  },
  debug: config.debug,
  ns: ['backend'],
  supportedLngs: config.languages.map((lng) => lng.value),
  load: 'languageOnly',
  fallbackLng: config.defaultLanguage,
  detection: {
    caches: ['cookie'],
  },
  defaultNS: 'backend',
};

// Init i18n instance
i18n.use(initReactI18next).init(initOptions);

export { i18n };
