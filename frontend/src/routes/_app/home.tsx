import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { userSheetSearchSchema } from '~/modules/common/search-params-schemas';
import { withSuspense } from '~/modules/common/with-suspense';
import { HomePage } from '~/modules/home/home-page';
import { homeLoader } from '~/modules/home/route-logic';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_app/home')({
  validateSearch: userSheetSearchSchema,
  loader: homeLoader,
  head: () => pageHead(i18n.t('c:home')),
  component: withSuspense(HomePage),
});
