import enApp from '../../../locales/en/app.json';
import enBackend from '../../../locales/en/backend.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';
import nlApp from '../../../locales/nl/app.json';
import nlBackend from '../../../locales/nl/backend.json';
import nlCommon from '../../../locales/nl/common.json';
import nlError from '../../../locales/nl/error.json';

/** Configure the locales you need in backend. `app.json` merges into `c`, matching the frontend. */
const locales = {
  en: { backend: enBackend, c: { ...enCommon, ...enApp }, error: enError },
  nl: { backend: nlBackend, c: { ...nlCommon, ...nlApp }, error: nlError },
};

export { locales };
