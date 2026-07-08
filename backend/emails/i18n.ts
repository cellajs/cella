import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { appConfig } from 'shared';
import enBackend from '../../locales/en/backend.json';
import enCommon from '../../locales/en/common.json';
import enError from '../../locales/en/error.json';
import nlBackend from '../../locales/nl/backend.json';
import nlCommon from '../../locales/nl/common.json';
import nlError from '../../locales/nl/error.json';

// Email templates use the same translation resources in server runtime and CLI preview.
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { backend: enBackend, c: enCommon, error: enError },
      nl: { backend: nlBackend, c: nlCommon, error: nlError },
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
