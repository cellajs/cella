import { appConfig } from 'shared';

/** Page title suffixed with the app name; the app name alone when `title` is empty. */
export function appTitle(title?: string) {
  if (!title) return appConfig.name;
  return `${title} - ${appConfig.name}`;
}

/** Route `head` with the app-suffixed title, plus a description tag when there is one. */
export function pageHead(title: string, description?: string) {
  const meta: { title?: string; name?: string; content?: string }[] = [{ title: appTitle(title) }];
  if (description) meta.push({ name: 'description', content: description });
  return { meta };
}
