import { appConfig } from 'config';

export default function appTitle(title?: string) {
  if (!title) return appConfig.name;
  return `${title} - ${appConfig.name}`;
}
