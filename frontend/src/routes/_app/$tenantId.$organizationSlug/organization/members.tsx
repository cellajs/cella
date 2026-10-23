import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { membersRouteSearchParamsSchema, membersSearchDefaults } from '~/modules/memberships/search-params-schemas';
import { OrganizationMembersComponent } from '~/modules/organization/route-components';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/$tenantId/$organizationSlug/organization/members')({
  validateSearch: membersRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(membersSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'members', label: 'c:member_other', description: 'c:tab_members.text' } },
  head: ({ match }) => pageHead(`${i18n.t('c:member_other')} · ${match.context.organization?.name}`),
  component: OrganizationMembersComponent,
});
