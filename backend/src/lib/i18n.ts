import i18n, { type InitOptions } from 'i18next';
import { appConfig } from 'shared';
import { locales } from '#/lib/i18n-locales';
import { env } from '../env';

export type { ParseKeys } from 'i18next';

/**
 *  Set up i18n options. In backend, all translations are loaded at once during server start.
 */
const initOptions: InitOptions = {
  resources: locales,
  debug: env.DEBUG,
  ns: ['backend', 'c', 'error', 'appError'],
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // React escapes by default
  },
  defaultNS: 'backend',
};

/**
 * Init i18n instance. Email templates call i18n.t() directly, so no React bindings needed.
 */
i18n.init(initOptions);
