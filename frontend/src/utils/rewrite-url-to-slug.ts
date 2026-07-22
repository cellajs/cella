import { redirect } from '@tanstack/react-router';

/**
 * Replaces ID route parameters with available slugs during `beforeLoad`.
 * Redirects without adding history or triggering another data fetch.
 */
export const rewriteUrlToSlug = <T extends Record<string, string>>(
  params: T,
  slugOverrides: Partial<Record<keyof T, string>>,
  routeTo: string,
) => {
  // Build new params, replacing IDs with slugs where available
  const newParams: Record<string, string> = { ...params };
  let hasChanges = false;

  for (const [key, slug] of Object.entries(slugOverrides)) {
    if (slug && params[key] !== slug) {
      newParams[key] = slug;
      hasChanges = true;
    }
  }

  if (hasChanges) {
    throw redirect({
      to: routeTo,
      params: newParams,
      replace: true, // Replace history entry, don't push
    });
  }
};
