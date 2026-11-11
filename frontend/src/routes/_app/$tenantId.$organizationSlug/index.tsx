import { createFileRoute } from '@tanstack/react-router';
import { withSuspense } from '~/modules/common/with-suspense';
import { OrganizationLobby } from '~/modules/organization/organization-lobby';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/')({
  staticData: { floatingNavButtons: { left: 'menu' }, keepNavSheet: true },
  head: ({ match }) => pageHead(match.context.organization?.name),
  component: withSuspense(OrganizationLobby),
});
