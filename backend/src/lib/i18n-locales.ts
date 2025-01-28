import enBackend from '../../../locales/en/backend.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/errors.json';
import nlBackend from '../../../locales/nl/backend.json';
import nlCommon from '../../../locales/nl/common.json';
import nlError from '../../../locales/nl/errors.json';

// Configure the locales you need in backend
const locales = {
  en: { backend: enBackend, common: enCommon, error: enError },
  nl: { backend: nlBackend, common: nlCommon, error: nlError },
};

export default locales;
