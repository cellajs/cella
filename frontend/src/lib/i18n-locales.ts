import i18n, { type ParseKeys } from 'i18next';
import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enAppError from '../../../locales/en/appError.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';

const enCommonExtended = { ...enCommon, ...enApp };

/** Any valid translation key: bare `c` keys plus `c:`/`about:`/`error:` prefixed ones, per i18next-resources.d.ts. */
export type TKey = ParseKeys;

/** A string with a translation in a loaded namespace, such as a key a server or a `setError` sends. */
export const isTKey = (key: string): key is TKey => i18n.exists(key);

export const locales = { en: { about: enAbout, appError: enAppError, c: enCommonExtended, error: enError } };

/** Every locale file as a lazy module, so each language ships as a hashed chunk the service worker precaches. */
const localeModules = import.meta.glob<Record<string, string>>('../../../locales/*/*.json', { import: 'default' });

const loadNamespace = (language: string, namespace: string): Promise<Record<string, string>> =>
  localeModules[`../../../locales/${language}/${namespace}.json`]?.() ?? Promise.resolve({});

/** i18next backend over the lazy locale modules; `c` merges `common` and `app` at load, the app's keys winning. */
export const lazyLocaleBackend = {
  type: 'backend' as const,
  init: () => {},
  read: (language: string, namespace: string, callback: (error: unknown, resources: Record<string, string> | boolean) => void) => {
    const resources =
      namespace === 'c'
        ? Promise.all([loadNamespace(language, 'common'), loadNamespace(language, 'app')]).then(([common, app]) => ({ ...common, ...app }))
        : loadNamespace(language, namespace);
    resources.then((loaded) => callback(null, loaded)).catch((error) => callback(error, false));
  },
};

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    if (!newModule?.locales) return;
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
