import { createFileRoute } from '@tanstack/react-router';
import { organizationLayoutBeforeLoad } from '~/modules/organization/route-logic';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug')({
  beforeLoad: ({ params, cause }) => organizationLayoutBeforeLoad({ params, cause }),
});
