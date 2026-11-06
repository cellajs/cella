import { toRuntimeNamespaces } from 'shared/utils/locale-namespaces';
import enApp from '../../../shared/locales/en/app.json';
import enAppError from '../../../shared/locales/en/appError.json';
import enBackend from '../../../shared/locales/en/backend.json';
import enCommon from '../../../shared/locales/en/common.json';
import enError from '../../../shared/locales/en/error.json';
import nlApp from '../../../shared/locales/nl/app.json';
import nlAppError from '../../../shared/locales/nl/appError.json';
import nlBackend from '../../../shared/locales/nl/backend.json';
import nlCommon from '../../../shared/locales/nl/common.json';
import nlError from '../../../shared/locales/nl/error.json';

/** Every language the backend serves, all loaded at start. A language or a locale file an app adds goes here. */
export const locales = {
  en: toRuntimeNamespaces({ app: enApp, appError: enAppError, backend: enBackend, common: enCommon, error: enError }),
  nl: toRuntimeNamespaces({ app: nlApp, appError: nlAppError, backend: nlBackend, common: nlCommon, error: nlError }),
};
