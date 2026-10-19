import type enAbout from '../../../locales/en/about.json';
import type enApp from '../../../locales/en/app.json';
import type enAppError from '../../../locales/en/appError.json';
import type enCommon from '../../../locales/en/common.json';
import type enError from '../../../locales/en/error.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: ['c', 'about', 'error'];
    // Matches the runtime option: with a separator, a key that is also another key's prefix types as `never`
    keySeparator: false;
    resources: { c: typeof enCommon & typeof enApp; about: typeof enAbout; error: typeof enError; appError: typeof enAppError };
  }
}
