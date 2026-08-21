import { createFileRoute } from '@tanstack/react-router';
import { OrganizationLayout } from '~/modules/organization/organization-layout';
import { organizationLayoutBeforeLoad } from '~/modules/organization/route-logic';
import { noDirectAccess } from '~/utils/no-direct-access';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug')({
  staticData: { isAuth: true },
  beforeLoad: async ({ params, cause, matches }) => {
    noDirectAccess(matches, '/_app/$tenantId/$organizationSlug', '/$tenantId/$organizationSlug/organization');

    return await organizationLayoutBeforeLoad({ params, cause });
  },
  component: OrganizationLayout,
});
