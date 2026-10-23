import { createFileRoute } from '@tanstack/react-router';
import { organizationLayoutBeforeLoad } from '~/modules/organization/route-logic';
import { noDirectAccess } from '~/utils/no-direct-access';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug')({
  staticData: { isAuth: true },
  beforeLoad: ({ params, cause, matches }) => {
    noDirectAccess(matches, '/_app/$tenantId/$organizationSlug', '/$tenantId/$organizationSlug/organization');

    return organizationLayoutBeforeLoad({ params, cause });
  },
});
