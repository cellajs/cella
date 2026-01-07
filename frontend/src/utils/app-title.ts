import { appConfig } from 'config';

/**
 * Generates a page title with the app name suffix.
 */
export default function appTitle(title?: string) {
  if (!title) return appConfig.name;
  return `${title} - ${appConfig.name}`;
}
