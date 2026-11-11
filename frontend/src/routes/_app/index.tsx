import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { userSheetSearchSchema } from '~/modules/common/search-params-schemas';
import { withSuspense } from '~/modules/common/with-suspense';
import { HomePage } from '~/modules/home/home-page';
import { pageHead } from '~/utils/app-title';

/** `/` is the home page too; the user sheet opens from its search. */
export const Route = createFileRoute('/_app/')({
  validateSearch: userSheetSearchSchema,
  head: () => pageHead(i18n.t('c:home')),
  component: withSuspense(HomePage),
});
