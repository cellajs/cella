import { createFileRoute, Outlet } from '@tanstack/react-router';
import { organizationLayoutBeforeLoad } from '~/modules/organization/route-logic';
import { noDirectAccess } from '~/utils/no-direct-access';

/**
 * Layout route for tenant and organization-scoped pages.
 * Captures $tenantId and $organizationSlug params, validates tenant access,
 * fetches org, and provides context for all nested routes.
 * Forks can nest additional routes (workspace, project, etc.) under this layout.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug')({
  staticData: { isAuth: true },
  beforeLoad: async ({ params, cause }) => {
    // Redirect bare layout path to the organization page
    noDirectAccess('/$tenantId/$organizationSlug', '/$tenantId/$organizationSlug/organization');

    return await organizationLayoutBeforeLoad({ params, cause });
  },
  component: Outlet,
});
