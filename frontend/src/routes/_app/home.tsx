import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { HomePage } from '~/modules/home/home-page';
import { homeBeforeLoad } from '~/modules/home/route-logic';
import { homeRouteSearchParamsSchema } from '~/modules/home/search-params-schemas';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/home')({
  validateSearch: homeRouteSearchParamsSchema,
  beforeLoad: ({ cause, search }) => homeBeforeLoad({ cause, skipWelcome: search.skipWelcome }),
  head: () => pageHead(i18n.t('c:home')),
  component: withSuspense(HomePage),
});
