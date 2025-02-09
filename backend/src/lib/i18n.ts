import i18n, { type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { config } from 'config';
import locales from './i18n-locales';

export type { ParseKeys } from 'i18next';

/**
 *  Set up i18n options. In backend, all translations are loaded at once during server start.
 */
const initOptions: InitOptions = {
  resources: locales,
  debug: config.debug,
  ns: ['backend', 'common', 'error'],
  supportedLngs: config.languages,
  load: 'languageOnly',
  fallbackLng: config.defaultLanguage,
  defaultNS: 'backend',
};

/**
 * Init i18n instance
 */
i18n.use(initReactI18next).init(initOptions);

export { i18n };
