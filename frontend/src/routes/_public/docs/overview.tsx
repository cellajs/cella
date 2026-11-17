import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { OverviewPage } from '~/modules/docs/overview-page';
import { overviewLoader } from '~/modules/docs/route-logic';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/docs/overview')({
  loader: overviewLoader,
  head: () => pageHead(i18n.t('c:api_overview')),
  component: withSuspense(OverviewPage),
});
