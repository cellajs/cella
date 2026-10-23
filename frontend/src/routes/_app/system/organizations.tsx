import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { organizationsRouteSearchParamsSchema, organizationsSearchDefaults } from '~/modules/organization/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OrganizationsTable = lazyNamed(() => import('~/modules/organization/table/organizations-table'), 'OrganizationsTable');

export const Route = createFileRoute('/_app/system/organizations')({
  validateSearch: organizationsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(organizationsSearchDefaults)] },
  staticData: { isAuth: true, navTab: { id: 'organizations', label: 'c:organization_other', description: 'c:tab_organizations.text' } },
  head: () => pageHead(i18n.t('c:organization_other')),
  component: withSuspense(OrganizationsTable),
});
