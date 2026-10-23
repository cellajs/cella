import { createRootRouteWithContext, redirect } from '@tanstack/react-router';
import { ApiError } from '~/lib/api';
import { pageNotFoundError } from '~/modules/common/error-helpers';
import { ErrorNotice } from '~/modules/common/error-notice';
import { Root } from '~/modules/common/root';
import { meQueryOptions } from '~/modules/me/query';
import { userStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

// Root boundary components stay local: a cross-module binding read at route-definition eval time can TDZ during HMR.
function RootErrorComponent({ error }: { error: unknown }) {
  return <ErrorNotice boundary="root" error={error} />;
}

function RootNotFoundComponent() {
  return <ErrorNotice boundary="root" error={pageNotFoundError()} />;
}

export const Route = createRootRouteWithContext()({
  staticData: { isAuth: false, boundary: 'root' },
  component: Root,
  beforeLoad: async ({ matches, location }) => {
    // Enforce isAuth globally: if the leaf route requires auth, verify the user session
    const leafMatch = matches[matches.length - 1];
    if (!leafMatch?.staticData?.isAuth) return;

    // The app layout handles a signed-out visit to `/`: /about on a first visit, sign-in after an earlier one
    if (location.pathname === '/') return;

    if (userStore.getState().user) return;

    try {
      await queryClient.query({ ...meQueryOptions(), staleTime: 'static' });
    } catch (error) {
      // Only a definitive 401 means signed out; network blips and 5xx rethrow to the root error boundary.
      if (!(error instanceof ApiError) || error.status !== 401) throw error;

      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: location.pathname + location.searchStr } });
    }
  },
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});
