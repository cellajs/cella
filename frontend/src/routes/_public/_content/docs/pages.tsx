import { createFileRoute } from '@tanstack/react-router';
import { pagesRouteSearchParamsSchema } from '~/modules/page/search-params-schemas';
import { withSuspense } from '~/routes/-route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';
import { stripParams } from '~/utils/strip-search-params';

const PagesTable = lazyNamed(() => import('~/modules/page/table/pages-table'), 'PagesTable');

/**
 * Pages table route - manages documentation pages.
 */
export const Route = createFileRoute('/_public/_content/docs/pages')({
  validateSearch: pagesRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('operationTag', 'schemaTag')],
  },
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Pages') }] }),
  component: withSuspense(PagesTable),
});
