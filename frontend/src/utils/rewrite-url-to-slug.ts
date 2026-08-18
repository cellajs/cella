import { redirect } from '@tanstack/react-router';

/** Replaces id route params with available slugs during `beforeLoad`, redirecting without adding a history entry. */
export const rewriteUrlToSlug = <T extends Record<string, string>>(
  params: T,
  slugOverrides: Partial<Record<keyof T, string>>,
  routeTo: string,
) => {
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
      replace: true,
    });
  }
};
