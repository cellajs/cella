import { createRootRouteWithContext, createRoute, defer, redirect } from '@tanstack/react-router';
import { lazy } from 'react';
import { zApiError } from 'sdk/zod.gen';
import { z } from 'zod';
import { ApiError } from '~/lib/api';
import { PublicContentLayout } from '~/modules/common/public-content-layout';
import { PublicLayout } from '~/modules/common/public-layout';
import { Root } from '~/modules/common/root';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { useUserStore } from '~/modules/user/user-store';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';
import {
  ErrorNoticePageComponent,
  RootErrorComponent,
  RootNotFoundComponent,
  withSuspenseSpinner,
} from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const AppLayout = lazy(() => import('~/modules/common/app/app-layout'));

/**
 * Defines the search params schema for error routes.
 */
export const errorSearchSchema = z.object({
  error: z.string().optional(),
  severity: zApiError.shape.severity.optional(),
});

export const RootRoute = createRootRouteWithContext()({
  staticData: { isAuth: false, boundary: 'root' },
  component: Root,
  beforeLoad: async ({ matches, location }) => {
    // Enforce isAuth globally: if the leaf route requires auth, verify the user session
    const leafMatch = matches[matches.length - 1];
    if (!leafMatch?.staticData?.isAuth) return;

    // Let AppLayoutRoute handle unauthenticated users on root path (redirects to /about)
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

/**
 * This is the layout for all public routes, for users without authentication. Marketing, auth pages and more.
 */
export const PublicLayoutRoute = createRoute({
  id: 'publicLayout',
  staticData: { isAuth: false, boundary: 'public' },
  getParentRoute: () => RootRoute,
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

/**
 * Sublayout for public routes that render synced public entities (docs pages, public projects,
 * task links). Mounts the public SSE stream so catchup + live updates run only while these routes
 * are active. Auth, sign-out, error and marketing routes stay parented to `PublicLayoutRoute`
 * directly and never open a stream connection.
 */
export const PublicContentLayoutRoute = createRoute({
  id: 'publicContentLayout',
  staticData: { isAuth: false, boundary: 'public' },
  getParentRoute: () => PublicLayoutRoute,
  component: PublicContentLayout,
});

/**
 * Layout for authenticated users requiring a valid user session.
 */
export const AppLayoutRoute = createRoute({
  id: 'appLayout',
  // isAuth is false here because RootRoute checks the leaf route's isAuth, not the layout's
  staticData: { isAuth: false, boundary: 'app' },
  getParentRoute: () => RootRoute,
  component: withSuspenseSpinner(AppLayout),
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching me before entering app:', location.pathname);

      // Try to use stored user, it will still revalidate below
      const storedUser = useUserStore.getState().user;
      if (storedUser) {
        console.info('Continuing user with session');
        // Start stream early so catchup runs in parallel with route loaders
        appStreamManager.connect();
        // Validate session in parallel — disconnect stream if stale
        queryClient.ensureQueryData({ ...meQueryOptions() }).catch(() => {
          appStreamManager.disconnect();
        });
        return { user: storedUser };
      }

      // Fetch and set user
      const user = await queryClient.ensureQueryData({ ...meQueryOptions() });
      // Start stream early so catchup runs in parallel with route loaders
      appStreamManager.connect();
      return { user };
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }

      // If root domain, check for last user to decide where to redirect
      if (location.pathname === '/') {
        const { lastUser } = useUserStore.getState();
        if (lastUser) throw redirect({ to: '/auth/authenticate', replace: true });
        throw redirect({ to: '/about', replace: true });
      }

      console.info('Not authenticated -> redirect to sign in');

      const url = new URL(location.pathname, window.location.origin);
      const redirectPath = url.pathname + url.search;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }
  },

  loader: async ({ cause, context }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching menu while loading app:', location.pathname);

      // Revalidate user if not already awaited above
      if (!context?.user) await queryClient.ensureQueryData({ ...meQueryOptions() });

      // Prefetch unseen counts alongside menu data
      queryClient.prefetchQuery(unseenCountsQueryOptions());

      // Get menu too but defer it so no need to hang while its being retrieved
      return defer(getMenuData());
    } catch (error) {
      if (error instanceof Error) {
        console.error(error);
        onError(error);
      }
    }
  },
});

/**
 * Generic error page for displaying application errors.
 */
export const ErrorNoticeRoute = createRoute({
  path: '/error',
  validateSearch: errorSearchSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Error') }] }),
  getParentRoute: () => PublicLayoutRoute,
  component: ErrorNoticePageComponent,
});
