import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { requireSession } from '~/modules/auth/route-logic';
import { withSuspense } from '~/modules/common/with-suspense';
import { pagesRouteSearchParamsSchema } from '~/modules/page/search-params-schemas';
import { PagesTable } from '~/modules/page/table/pages-table';
import { pageHead } from '~/utils/app-title';
import { stripForeignParams } from '~/utils/strip-foreign-params';

/** The pages table is for signed-in editors: the one page under the public layout that needs a session. */
export const Route = createFileRoute('/_public/docs/pages')({
  validateSearch: pagesRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('operationTag', 'schemaTag', 'filter', 'sort', 'order')] },
  beforeLoad: ({ location }) => requireSession(location),
  head: () => pageHead(i18n.t('c:page_other')),
  component: withSuspense(PagesTable),
});
