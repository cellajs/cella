import { redirect } from '@tanstack/react-router';

/**
 * Rewrite URL params to use slugs instead of IDs where available.
 *
 * Call this in beforeLoad after fetching entity data. If the user navigated
 * using IDs but entities have slugs, this will redirect (replace) to
 * the prettier slug-based URL without causing a re-render or extra fetch.
 *
 * @param params - Current route params
 * @param slugOverrides - Map of param names to their slug values (e.g., { orgId: 'my-org', tenantId: 'abc' })
 * @param routeTo - Target route path
 *
 * @example
 * beforeLoad: async ({ params }) => {
 *   const workspace = await queryClient.ensureQueryData(workspaceQueryOptions(params.orgId));
 *   const org = queryClient.getQueryData(organizationQueryKeys.detail.byId(workspace.organizationId));
 *   rewriteUrlToSlug(params, { orgId: org?.slug, tenantId }, WorkspaceRoute.to);
 *   return { workspace };
 * }
 */
export const rewriteUrlToSlug = (
  params: Record<string, string>,
  slugOverrides: Record<string, string | undefined>,
  routeTo: string,
) => {
  // Build new params, replacing IDs with slugs where available
  const newParams = { ...params };
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
