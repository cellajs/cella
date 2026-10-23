import type { ParseKeys } from 'i18next';
import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enAppError from '../../../locales/en/appError.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';

const enCommonExtended = { ...enCommon, ...enApp };

/** Any valid translation key: bare `c` keys plus `c:`/`about:`/`error:` prefixed ones, per i18next-resources.d.ts. */
export type TKey = ParseKeys;

export const locales = { en: { about: enAbout, appError: enAppError, c: enCommonExtended, error: enError } };

if (import.meta.hot) {
  import.meta.hot.accept(async (newModule) => {
    if (!newModule?.locales) return;
    const { default: i18n } = await import('i18next');
    const updated = newModule.locales as typeof locales;
    for (const [language, namespaces] of Object.entries(updated)) {
      for (const [namespace, resources] of Object.entries(namespaces)) {
        i18n.addResourceBundle(language, namespace, resources, true, true);
      }
    }
    // Trigger react-i18next re-render
    i18n.emit('languageChanged', i18n.language);
  });
}
