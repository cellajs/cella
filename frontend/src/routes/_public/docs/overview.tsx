import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { OverviewPage } from '~/modules/docs/overview-page';
import { infoQueryOptions, openApiSpecQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/docs/overview')({
  loader: async () => {
    await Promise.all([queryClient.query(infoQueryOptions), queryClient.query(openApiSpecQueryOptions)]);
  },
  head: () => pageHead(i18n.t('c:api_overview')),
  component: withSuspense(OverviewPage),
});
