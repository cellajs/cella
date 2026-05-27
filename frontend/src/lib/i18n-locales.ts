import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';

const enCommonExtended = {
  ...enCommon,
  ...enApp,
} as const;

type CommonKeys = keyof typeof enCommonExtended;
type ErrorKeys = keyof typeof enError;

type CommonTranslationKey = `c:${CommonKeys & string}`;
type ErrorTranslationKey = `error:${ErrorKeys & string}`;

export type TKey = CommonTranslationKey | ErrorTranslationKey;

/**
 * Import all relevant locales in an object to be used by i18next.
 */
const locales = {
  en: { about: enAbout, c: enCommonExtended, error: enError },
};

export default locales;

// HMR boundary: accept updated locale modules and push them into i18next
if (import.meta.hot) {
  import.meta.hot.accept(async (newModule) => {
    if (!newModule?.default) return;
    const i18next = await import('i18next');
    const i18n = i18next.default;
    const updated = newModule.default as typeof locales;
    for (const [lang, namespaces] of Object.entries(updated)) {
      for (const [ns, resources] of Object.entries(namespaces)) {
        i18n.addResourceBundle(lang, ns, resources, true, true);
      }
    }
    // Trigger react-i18next re-render
    i18n.emit('languageChanged', i18n.language);
  });
}
