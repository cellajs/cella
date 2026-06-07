import { createRoute, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { getErrorInfo } from '~/modules/common/error-helpers';
import { useToastStore } from '~/modules/common/toaster/toast-store';
import type { ToastSeverity } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { AppLayoutRoute, errorSearchSchema } from '~/routes/base-routes';
import { withSuspenseSpinner } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const UserAccountPage = lazy(() => import('~/modules/me/account-page'));

/**
 * User account settings page for personal configuration.
 * Accepts error/severity search params from backend OAuth connect redirects
 * (e.g. /account?error=oauth_conflict&severity=error) — shows a toast and cleans the URL.
 */
export const UserAccountRoute = createRoute({
  path: '/account',
  staticData: { isAuth: true },
  validateSearch: errorSearchSchema,
  head: () => ({ meta: [{ title: appTitle('Settings') }] }),
  getParentRoute: () => AppLayoutRoute,
  beforeLoad: ({ search }) => {
    if (search.error) {
      const { message } = getErrorInfo({ errorFromQuery: search.error });

      const severityMap: Record<string, ToastSeverity> = { error: 'error', warn: 'warning', fatal: 'error' };

      const toastSeverity = severityMap[search.severity ?? ''] ?? 'warning';
      useToastStore.getState().showToast(message, toastSeverity);
      // Redirect to clean URL (strips error/severity search params)
      throw redirect({ to: '/account', search: {}, replace: true });
    }
  },
  loader: async () => {
    const userAuthOptions = meAuthQueryOptions();
    return queryClient.ensureQueryData({ ...userAuthOptions });
  },
  component: withSuspenseSpinner(UserAccountPage),
});
