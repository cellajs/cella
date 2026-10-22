import { redirect } from '@tanstack/react-router';

/**
 * Replaces id route params with the slugs a `beforeLoad` resolved, through a history-replacing redirect to the route
 * being entered: `'.'` resolves against the pending location, so a layout's rewrite keeps the path below it. The
 * params not overridden, the search and the hash carry over.
 */
export const rewriteUrlToSlug = <T extends Record<string, string>>(params: T, slugOverrides: Partial<Record<keyof T, string>>) => {
  const newParams: Record<string, string> = { ...params };
  let hasChanges = false;

  for (const [key, slug] of Object.entries(slugOverrides)) {
    if (slug && params[key] !== slug) {
      newParams[key] = slug;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    throw redirect({ to: '.', params: newParams, search: true, hash: true, replace: true });
  }
};
