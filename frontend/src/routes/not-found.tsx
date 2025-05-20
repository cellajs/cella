import { NotFoundRoute } from '@tanstack/react-router';
import { t } from 'i18next';
import ErrorNotice from '~/modules/common/error-notice';
import { rootRoute } from '~/routes/base';

export const notFoundRoute = new NotFoundRoute({
  staticData: { pageTitle: 'NotFound', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => {
    return <ErrorNotice error={{ name: t('error:page_not_found'), message: t('error:page_not_found.text'), severity: 'info' }} level="root" />;
  },
});
