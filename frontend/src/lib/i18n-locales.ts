import enAbout from '../../../locales/en/about.json';
import enApp from '../../../locales/en/app.json';
import enCommon from '../../../locales/en/common.json';
import enError from '../../../locales/en/error.json';

const enCommonExtended = {
  ...enCommon,
  ...enApp,
} as const;

type CommonKeys = keyof typeof enCommonExtended;
type ErrorKeys = keyof typeof enError;

type CommonTranslationKey = `common:${CommonKeys & string}`;
type ErrorTranslationKey = `error:${ErrorKeys & string}`;

export type TKey = CommonTranslationKey | ErrorTranslationKey;

/**
 * Import all relevant locales in an object to be used by i18next.
 */
const locales = {
  en: { about: enAbout, common: enCommonExtended, error: enError },
};

export default locales;
