import { appConfig } from 'config';
import i18n, { type InitOptions } from 'i18next';
import { initReactI18next } from 'react-i18next';
import locales from '#/lib/i18n-locales';

export type { ParseKeys } from 'i18next';

/**
 *  Set up i18n options. In backend, all translations are loaded at once during server start.
 */
const initOptions: InitOptions = {
  resources: locales,
  debug: appConfig.debug,
  ns: ['backend', 'common', 'error', 'appError'],
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  defaultNS: 'backend',
};

/**
 * Init i18n instance
 */
i18n.use(initReactI18next).init(initOptions);
