import type { LocaleResources } from '../../../shared/locales/resources.gen';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: ['c', 'about', 'error'];
    // Matches the runtime option: with a separator, a key that is also another key's prefix types as `never`
    keySeparator: false;
    parseInterpolation: false;
    resources: Pick<LocaleResources, 'about' | 'appError' | 'c' | 'error'>;
  }
}
