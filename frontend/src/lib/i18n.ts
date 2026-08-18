import i18n, { type InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';
import { appConfig } from 'shared';
import { env } from '~/env';
import { locales } from '~/lib/i18n-locales';

/** i18n options: bundled preload for the default language, HTTP-loaded namespaces for the rest. */
const initOptions: InitOptions = {
  resources: locales, // Preload default ('en') translations
  debug: env.VITE_DEBUG_I18N,
  ns: ['c', 'about', 'error'],
  partialBundledLanguages: true,
  supportedLngs: appConfig.languages,
  load: 'languageOnly',
  fallbackLng: appConfig.defaultLanguage,
  interpolation: {
    escapeValue: false, // React escapes by default
  },
  react: {
    useSuspense: false,
  },
  defaultNS: 'c',
  backend: {
    // Processed namespaces (common + app merged into `c`), served by the vite plugin in dev and as build assets.
    loadPath: '/locales/{{lng}}/{{ns}}.json',
  },
};

const instance = i18n.use(Backend).use(LanguageDetector).use(initReactI18next);

instance.init(initOptions);

// HMR for lazy-loaded locales (non-bundled languages and HTTP-loaded namespaces)
if (import.meta.hot) {
  import.meta.hot.on('i18next-hmr:update', () => {
    i18n.reloadResources().then(() => {
      i18n.emit('languageChanged', i18n.language);
    });
  });
}
