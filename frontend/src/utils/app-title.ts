import { appConfig } from 'shared';

/** Page title suffixed with the app name; the app name alone when `title` is empty. */
export function appTitle(title?: string) {
  if (!title) return appConfig.name;
  return `${title} - ${appConfig.name}`;
}
