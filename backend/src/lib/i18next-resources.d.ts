import type { LocaleResources } from '../../../shared/locales/resources.gen';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'backend';
    // Matches the runtime option: a dot is part of a key, never a path into nested objects
    keySeparator: false;
    parseInterpolation: false;
    resources: Pick<LocaleResources, 'appError' | 'backend' | 'c' | 'error'>;
  }
}
