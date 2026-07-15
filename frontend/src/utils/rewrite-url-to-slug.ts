import { redirect } from '@tanstack/react-router';

/**
 * Rewrite URL params to use slugs instead of IDs where available.
 *
 * Call in beforeLoad after fetching entity data: if the user navigated by IDs but entities have
 * slugs, redirects (replace) to the slug-based URL without a re-render or extra fetch.
 *
 * @example
 * beforeLoad: async ({ params }) => {
 *   const workspace = await queryClient.ensureQueryData(workspaceQueryOptions(params.organizationSlug));
 *   const org = queryClient.getQueryData(organizationQueryKeys.detail.byId(workspace.organizationId));
 *   rewriteUrlToSlug(params, { organizationSlug: org?.slug, tenantId }, WorkspaceRoute.to);
 *   return { workspace };
 * }
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
