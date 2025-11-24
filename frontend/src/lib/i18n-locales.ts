import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enCommon from '../../../locales/en/common.json';
import enErrors from '../../../locales/en/errors.json';

type AppKeys = keyof typeof enApp;
type CommonKeys = keyof typeof enCommon;
type ErrorKeys = keyof typeof enErrors;

type AppTranslationKey = `app:${AppKeys & string}`;
type CommonTranslationKey = `common:${CommonKeys & string}`;
type ErrorTranslationKey = `error:${ErrorKeys & string}`;

export type TKey = AppTranslationKey | CommonTranslationKey | ErrorTranslationKey;

/**
 * Import all relevant locales in an object to be used by i18next.
 */
const locales = {
  en: { about: enAbout, app: enApp, common: enCommon, error: enErrors },
};

export default locales;
