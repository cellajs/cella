import type enAbout from '../../../locales/en/about.json';
import type enApp from '../../../locales/en/app.json';
import type enCommon from '../../../locales/en/common.json';
import type enError from '../../../locales/en/error.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: ['c', 'about', 'error'];
    resources: {
      c: typeof enCommon & typeof enApp;
      about: typeof enAbout;
      error: typeof enError;
    };
  }
}
