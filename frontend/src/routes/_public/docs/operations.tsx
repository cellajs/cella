import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { OperationsPage } from '~/modules/docs/operations/operations-page';
import { operationsLoader } from '~/modules/docs/route-logic';
import { operationsRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { pageHead } from '~/utils/app-title';
import { stripForeignParams } from '~/utils/strip-foreign-params';

export const Route = createFileRoute('/_public/docs/operations')({
  validateSearch: operationsRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('schemaTag', 'sort', 'order')] },
  loader: operationsLoader,
  head: () => pageHead(i18n.t('c:operation_other')),
  component: withSuspense(OperationsPage),
});
