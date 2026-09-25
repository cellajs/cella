import i18n, { type InitOptions } from 'i18next';
import { appConfig } from 'shared';
import { locales } from '#/lib/i18n-locales';
import { env } from '../env';

export type { ParseKeys } from 'i18next';

/** All backend translations load at once during server start. */
const initOptions: InitOptions = {
  resources: locales,
  // Vitest skips env parsing, so DEBUG arrives as the raw string there and 'false' must not read as on.
  debug: env.DEBUG === true,
  ns: ['backend', 'c', 'error', 'appError'],
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // Texts land in JSON responses; the email templates escape through their own instance
  },
  defaultNS: 'backend',
};

/** The API's instance, for error messages and schema texts; emails use `backend/emails/i18n.ts`. */
i18n.init(initOptions);

export { i18n };
