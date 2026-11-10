import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { organizationsRouteSearchParamsSchema, organizationsTableSearchDefaults } from '~/modules/organization/search-params-schemas';
import { OrganizationsTable } from '~/modules/organization/table/organizations-table';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/system/organizations')({
  staticData: { navTab: { id: 'organizations', label: 'c:organization_other', description: 'c:tab_organizations.text' } },
  validateSearch: organizationsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(organizationsTableSearchDefaults)] },
  head: () => pageHead(i18n.t('c:organization_other')),
  component: withSuspense(OrganizationsTable),
});
