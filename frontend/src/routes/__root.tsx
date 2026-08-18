import { createRootRouteWithContext, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { ApiError } from '~/lib/api';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Root } from '~/modules/common/root';
import { meQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

// Root boundary components stay local: a cross-module binding read at route-definition eval time can TDZ during HMR.
function RootErrorComponent({ error }: { error: unknown }) {
  return <ErrorNotice boundary="root" error={error as ErrorNoticeError} />;
}

function RootNotFoundComponent() {
  return (
    <ErrorNotice
      error={{
        type: 'page_not_found',
        severity: 'info',
        status: 404,
        name: i18n.t('error:page_not_found'),
        message: i18n.t('error:page_not_found.text'),
      }}
      boundary="root"
    />
  );
}

export const Route = createRootRouteWithContext()({
  staticData: { isAuth: false, boundary: 'root' },
  component: Root,
  beforeLoad: async ({ matches, location }) => {
    // Enforce isAuth globally: if the leaf route requires auth, verify the user session
    const leafMatch = matches[matches.length - 1];
    if (!leafMatch?.staticData?.isAuth) return;

    // Let the app layout route handle unauthenticated users on root path (redirects to /about)
    if (location.pathname === '/') return;

    const storedUser = useUserStore.getState().user;
    if (storedUser) return;

    try {
      await queryClient.ensureQueryData({ ...meQueryOptions() });
    } catch (error) {
      // Only a definitive 401 means signed out; network blips and 5xx rethrow to the root error boundary.
      if (!(error instanceof ApiError) || Number(error.status) !== 401) throw error;

      console.info('[RootRoute] Not authenticated -> redirect to sign in');
      const redirectPath = location.pathname + location.searchStr;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }
  },
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});
