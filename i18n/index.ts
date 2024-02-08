import i18next, { InitOptions } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import Backend from 'i18next-http-backend';
import { initReactI18next } from 'react-i18next';

import { config } from 'config';
import enBackend from './locales/en/backend.json';
import enFrontend from './locales/en/frontend.json';
import nlBackend from './locales/nl/backend.json';

export type { ParseKeys } from 'i18next';

interface KeyRequest {
  key: string;
  namespace: string;
  language: string;
  text: string;
}

export const defaultNS = 'frontend';

const projectToken = config.integrations.simpleLocalizeProjectToken;
const apiKey = process.env.SIMPLELOCALIZE_API_KEY;
const cdnBaseUrl = 'https://cdn.simplelocalize.io';
const environment = '_latest'; // or "_production"

const loadPathWithNamespaces = `${cdnBaseUrl}/${projectToken}/${environment}/{{lng}}/{{ns}}`;
const endpoint = 'https://api.simplelocalize.io/api/v1/translations?importOptions=REPLACE_TRANSLATION_IF_FOUND';
const missingKeysPushInterval = 10_000; // 10 seconds

let missingKeysRequests: KeyRequest[] = [];

const missingKeyHandler = (_languages: readonly string[], namespace: string, key: string, fallbackValue: string) => {
  missingKeysRequests.push({
    key,
    namespace: namespace,
    language: config.defaultLanguage,
    text: fallbackValue,
  });
};

const pushMissingKeys = () => {
  if (missingKeysRequests.length > 0 && apiKey) {
    console.log(`[SimpleLocalize] Pushing missing keys: ${missingKeysRequests.length}`);
    const requestBody = {
      content: missingKeysRequests,
    };
    fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'X-SimpleLocalize-Token': apiKey,
      },
      body: JSON.stringify(requestBody),
    });
    missingKeysRequests = [];
  }
};

// @refresh reset
setInterval(() => pushMissingKeys(), missingKeysPushInterval);

export const getI18n = (ns: 'frontend' | 'backend' = 'frontend') => {
  let i18n = i18next.use(LanguageDetector).use(initReactI18next);

  let initOptions: InitOptions = {
    ns: [ns],
    supportedLngs: config.languages.map((lng) => lng.value),
    load: 'languageOnly',
    fallbackLng: config.defaultLanguage,
    detection: {
      caches: ['cookie'],
    },
    defaultNS,
  };

  if (config.integrations.simpleLocalizeProjectToken) {
    initOptions = {
      ...initOptions,
      backend: {
        loadPath: loadPathWithNamespaces,
      },
      missingKeyHandler,
      saveMissing: true,
    };

    i18n = i18n.use(Backend);
  } else {
    initOptions.resources = {
      en: {
        frontend: enFrontend,
        backend: enBackend,
      },
      nl: {
        backend: nlBackend,
      },
    };
  }

  i18n.init(initOptions);

  return i18n;
};
