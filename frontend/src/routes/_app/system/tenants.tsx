import { createFileRoute, stripSearchParams } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { tenantsRouteSearchParamsSchema, tenantsSearchDefaults } from '~/modules/tenants/search-params-schemas';
import { TenantsTable } from '~/modules/tenants/table/tenants-table';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/system/tenants')({
  staticData: { navTab: { id: 'tenants', label: 'c:tenant_other', description: 'c:tab_tenants.text' } },
  validateSearch: tenantsRouteSearchParamsSchema,
  search: { middlewares: [stripSearchParams(tenantsSearchDefaults)] },
  head: () => pageHead(i18n.t('c:tenant_other')),
  component: withSuspense(TenantsTable),
});
