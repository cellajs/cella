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

/** Configure the locales you need in backend. `app.json` merges into `c`, matching the frontend; `appError.json` holds the app's own error types. */
const locales = {
  en: { backend: enBackend, c: { ...enCommon, ...enApp }, error: enError, appError: enAppError },
  nl: { backend: nlBackend, c: { ...nlCommon, ...nlApp }, error: nlError, appError: nlAppError },
};

export { locales };
