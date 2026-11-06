import { toRuntimeNamespaces } from 'shared/utils/locale-namespaces';
import enApp from '../../../locales/en/app.json';
import enAppError from '../../../locales/en/appError.json';
import enBackend from '../../../locales/en/backend.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';
import nlApp from '../../../locales/nl/app.json';
import nlAppError from '../../../locales/nl/appError.json';
import nlBackend from '../../../locales/nl/backend.json';
import nlCommon from '../../../locales/nl/common.json';
import nlError from '../../../locales/nl/error.json';

/** Every language the backend serves, all loaded at start. A language or a locale file an app adds goes here. */
export const locales = {
  en: toRuntimeNamespaces({ app: enApp, appError: enAppError, backend: enBackend, common: enCommon, error: enError }),
  nl: toRuntimeNamespaces({ app: nlApp, appError: nlAppError, backend: nlBackend, common: nlCommon, error: nlError }),
};
