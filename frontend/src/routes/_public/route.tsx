import { createFileRoute } from '@tanstack/react-router';
import { ApiError } from '~/lib/api';
import { PublicLayout } from '~/modules/common/public-layout';
import { meQueryOptions } from '~/modules/me/query';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';

/**
 * This is the layout for all public routes, for users without authentication. Marketing, auth pages and more.
 */
export const Route = createFileRoute('/_public')({
  staticData: { isAuth: false, boundary: 'public' },
  component: PublicLayout,
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter' || location.pathname === '/sign-out') return;

    try {
      console.debug('[PublicLayout] Fetching me while entering public page:', location.pathname);

      // Fetch and set user
      await queryClient.ensureQueryData({ ...meQueryOptions() });
    } catch (error) {
      // A 401 on /me is expected for unauthenticated visitors on public pages — ignore silently
      if (error instanceof ApiError && error.status === 401) return;

      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }
    }
  },
});
