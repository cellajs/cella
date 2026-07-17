import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { OrganizationMembersComponent } from '~/modules/organization/route-components';
import { appTitle } from '~/utils/app-title';

/**
 * Organization members table for managing memberships.
 */
export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/members')({
  validateSearch: membersRouteSearchParamsSchema,
  // Absence means default: params equal to the default view are stripped from the URL
  search: { middlewares: [stripSearchParams(membersSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'members', label: 'c:member_other' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Members · ${match.context.organization?.name}`) }] }),
  component: OrganizationMembersComponent,
});
