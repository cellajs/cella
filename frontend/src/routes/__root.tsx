import { createRootRouteWithContext, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { Root } from '~/modules/common/root';
import { meQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';

// Root boundary components are defined locally (not imported) so their bindings are never read
// cross-module at route-definition eval time — which can TDZ during HMR re-evaluation.
const RootErrorComponent = ({ error }: { error: unknown }) => (
  <ErrorNotice boundary="root" error={error as ErrorNoticeError} />
);

const RootNotFoundComponent = () => (
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
    } catch {
      console.info('[RootRoute] Not authenticated -> redirect to sign in');
      const redirectPath = location.pathname + location.searchStr;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }
  },
  errorComponent: RootErrorComponent,
  notFoundComponent: RootNotFoundComponent,
});
