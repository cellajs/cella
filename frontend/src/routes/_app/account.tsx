import { createFileRoute, redirect } from '@tanstack/react-router';
import { getErrorInfo } from '~/modules/common/error-helpers';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';
import { useToastStore } from '~/modules/common/toaster/toast-store';
import type { ToastSeverity } from '~/modules/common/toaster/toaster';
import { meAuthQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { withSuspenseSpinner } from '~/routes/_route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const UserAccountPage = lazyNamed(() => import('~/modules/me/account-page'), 'UserAccountPage');

/**
 * User account settings page. Accepts error/severity search params from backend OAuth connect
 * redirects (e.g. ?error=oauth_conflict&severity=error), shows a toast, and cleans the URL.
 */
export const Route = createFileRoute('/_app/account')({
  staticData: { isAuth: true },
  validateSearch: errorSearchSchema,
  head: () => ({ meta: [{ title: appTitle('Settings') }] }),
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
