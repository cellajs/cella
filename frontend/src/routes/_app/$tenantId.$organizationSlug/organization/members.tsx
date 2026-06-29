import { createFileRoute } from '@tanstack/react-router';
import { membersRouteSearchParamsSchema } from '~/modules/memberships/search-params-schemas';
import { OrganizationMembersComponent } from '~/modules/organization/route-components';
import appTitle from '~/utils/app-title';

/**
 * Organization members table for managing memberships.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/members')({
  validateSearch: membersRouteSearchParamsSchema,
  staticData: { isAuth: true, navTab: { id: 'members', label: 'c:members' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Members · ${match.context.organization?.name}`) }] }),
  component: OrganizationMembersComponent,
});
