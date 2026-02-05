import { createRoute, redirect } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { getErrorInfo } from '~/modules/common/error-notice';
import Spinner from '~/modules/common/spinner';
import { ToastSeverity } from '~/modules/common/toaster/service';
import { meAuthQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute, errorSearchSchema } from '~/routes/base-routes';
import { useToastStore } from '~/store/toast';
import appTitle from '~/utils/app-title';

const UserAccountPage = lazy(() => import('~/modules/me/account-page'));

/**
 * User account settings page for personal configuration.
 */
export const UserAccountRoute = createRoute({
  path: '/account',
  staticData: { isAuth: true },
  validateSearch: errorSearchSchema,
  head: () => ({ meta: [{ title: appTitle('My account') }] }),
  getParentRoute: () => AppLayoutRoute,
  beforeLoad: ({ search }) => {
    if (search.error) {
      const { message } = getErrorInfo({ errorFromQuery: search.error });

      const severityMap: Record<string, ToastSeverity> = { error: 'error', warn: 'warning', fatal: 'error' };

      const toastSeverity = severityMap[search.severity || 'warning'];
      useToastStore.getState().showToast(message, toastSeverity);
      throw redirect({ to: '/account', replace: true });
    }
  },
  loader: async () => {
    const userAuthOptions = meAuthQueryOptions();
    return queryClient.ensureQueryData({ ...userAuthOptions });
  },
  component: () => {
    return (
      <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
        <UserAccountPage />
      </Suspense>
    );
  },
});
