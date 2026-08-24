import i18n from 'i18next';
import { appConfig } from 'shared';
import enApp from '../../locales/en/app.json';
import enBackend from '../../locales/en/backend.json';
import enCommon from '../../locales/en/common.json';
import enError from '../../locales/en/error.json';
import nlApp from '../../locales/nl/app.json';
import nlBackend from '../../locales/nl/backend.json';
import nlCommon from '../../locales/nl/common.json';
import nlError from '../../locales/nl/error.json';

// Templates call i18n.t() directly, so no React bindings are needed.
if (!i18n.isInitialized) {
  i18n.init({
    resources: {
      en: { backend: enBackend, c: { ...enCommon, ...enApp }, error: enError },
      nl: { backend: nlBackend, c: { ...nlCommon, ...nlApp }, error: nlError },
    },
    ns: ['backend', 'c', 'error'],
    supportedLngs: appConfig.languages,
    load: 'languageOnly',
    fallbackLng: appConfig.defaultLanguage,
    interpolation: {
      escapeValue: false,
    },
    defaultNS: 'backend',
  });
}

export { i18n };
