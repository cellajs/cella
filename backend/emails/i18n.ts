import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { appConfig } from 'shared';

import enBackend from '../../locales/en/backend.json';
import enCommon from '../../locales/en/common.json';
import enError from '../../locales/en/error.json';
import nlBackend from '../../locales/nl/backend.json';
import nlCommon from '../../locales/nl/common.json';
import nlError from '../../locales/nl/error.json';

/**
 * Initialize i18n for email templates.
 * This ensures translations work both during server runtime and CLI preview.
 */
if (!i18n.isInitialized) {
  i18n.use(initReactI18next).init({
    resources: {
      en: { backend: enBackend, common: enCommon, error: enError },
      nl: { backend: nlBackend, common: nlCommon, error: nlError },
    },
    ns: ['backend', 'common', 'error'],
    supportedLngs: appConfig.languages,
    load: 'languageOnly',
    fallbackLng: appConfig.defaultLanguage,
    interpolation: {
      escapeValue: false,
    },
    defaultNS: 'backend',
  });
}

export default i18n;
