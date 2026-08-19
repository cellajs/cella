import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { OrganizationMembersComponent } from '~/modules/organization/route-components';
import { appTitle } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/members')({
  validateSearch: membersRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(membersSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'members', label: 'c:member_other', description: 'c:tab_members.text' } },
  head: ({ match }) => ({ meta: [{ title: appTitle(`Members · ${match.context.organization?.name}`) }] }),
  component: OrganizationMembersComponent,
});
