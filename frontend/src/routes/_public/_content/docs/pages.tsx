import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { pagesRouteSearchParamsSchema } from '~/modules/page/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';
import { stripParams } from '~/utils/strip-search-params';

const PagesTable = lazyNamed(() => import('~/modules/page/table/pages-table'), 'PagesTable');

export const Route = createFileRoute('/_public/_content/docs/pages')({
  validateSearch: pagesRouteSearchParamsSchema,
  search: { middlewares: [stripParams('operationTag', 'schemaTag')] },
  staticData: { isAuth: true },
  head: () => pageHead(i18n.t('c:page_other')),
  component: withSuspense(PagesTable),
});
