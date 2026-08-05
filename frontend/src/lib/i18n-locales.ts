import type { ParseKeys } from 'i18next';
import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';

const enCommonExtended = {
  ...enCommon,
  ...enApp,
};

/**
 * Any valid translation key: bare `c` keys plus `c:`/`about:`/`error:` prefixed ones,
 * derived from the resource declaration in i18next-resources.d.ts. Use it to type
 * props and variables that flow into t(), and to cast runtime-composed keys.
 */
export type TKey = ParseKeys;

/**
 * Import all relevant locales in an object to be used by i18next.
 */
const locales = {
  en: { about: enAbout, c: enCommonExtended, error: enError },
};

export { locales };

// HMR boundary: accept updated locale modules and push them into i18next
if (import.meta.hot) {
  import.meta.hot.accept(async (newModule) => {
    if (!newModule?.locales) return;
    const i18next = await import('i18next');
    const i18n = i18next.default;
    const updated = newModule.locales as typeof locales;
    for (const [lang, namespaces] of Object.entries(updated)) {
      for (const [ns, resources] of Object.entries(namespaces)) {
        i18n.addResourceBundle(lang, ns, resources, true, true);
      }
    }
    // Trigger react-i18next re-render
    i18n.emit('languageChanged', i18n.language);
  });
}
