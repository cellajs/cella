import i18next from 'i18next';
import { appConfig } from 'shared';
import { locales } from '#/lib/i18n-locales';

/**
 * The email templates' own i18next instance, kept apart from the API's error messages (JSON text). Templates call
 * `i18n.t()` directly, so no React bindings are needed. Interpolated values are HTML-escaped by default, because bodies
 * and headers render as HTML: markup belongs in the translation string, never in a value.
 */
const i18n = i18next.createInstance();

i18n.init({
  resources: locales,
  ns: ['backend', 'c', 'error'],
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: { escapeValue: true },
  defaultNS: 'backend',
});

/**
 * Spread into the options of a plain-text output that interpolates values (a subject, a preview, JSX text): the mail
 * header or the renderer escapes it, so escaping here too would show `&amp;` to the reader.
 */
export const plainText = { interpolation: { escapeValue: false } } as const;

export { i18n };
