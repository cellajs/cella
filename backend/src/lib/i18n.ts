import process from 'node:process';
import i18n, { type InitOptions } from 'i18next';
import { appConfig } from 'shared';
import { addI18nFormatters, i18nDefaultVariables } from 'shared/utils/i18n-text';
import { locales } from '#/lib/i18n-locales';

/** All backend translations load at once during server start. */
const initOptions: InitOptions = {
  resources: locales,
  // AppError (core/error.ts) reaches this module from the cdc and yjs bundles, whose containers lack the backend's
  // secrets: importing `env` here would fail their boot on its validation.
  // biome-ignore lint/style/noProcessEnv: see above
  debug: process.env.DEBUG === 'true',
  ns: ['backend', 'c', 'error', 'appError'],
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    // Texts go into JSON responses; the email templates escape through their own instance.
    escapeValue: false,
    defaultVariables: i18nDefaultVariables,
  },
  defaultNS: 'backend',
  // The locale files are flat: a dot is part of a key, never a path into nested objects
  keySeparator: false,
};

/** The API's instance, for error messages and schema texts; emails use `backend/emails/i18n.ts`. */
i18n.init(initOptions);
addI18nFormatters(i18n.services.formatter);

export { i18n };
