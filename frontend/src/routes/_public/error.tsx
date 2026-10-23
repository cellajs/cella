import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';
import { ErrorNoticePageComponent } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';

export const Route = createFileRoute('/_public/error')({
  validateSearch: errorSearchSchema,
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:error')),
  component: ErrorNoticePageComponent,
});
