import enBackend from '../../../locales/en/backend.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';
import nlBackend from '../../../locales/nl/backend.json';
import nlCommon from '../../../locales/nl/common.json';
import nlError from '../../../locales/nl/error.json';

/**
 * Configure the locales you need in backend.
 */
const locales = {
  en: { backend: enBackend, c: enCommon, error: enError },
  nl: { backend: nlBackend, c: nlCommon, error: nlError },
};

export default locales;
