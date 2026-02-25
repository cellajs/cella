import * as Sentry from '@sentry/react';
import { createRootRouteWithContext, createRoute, defer, redirect } from '@tanstack/react-router';
import i18n from 'i18next';
import { lazy, Suspense } from 'react';
import { appConfig } from 'shared';
import { z } from 'zod';
import { zApiError } from '~/api.gen/zod.gen';
import { ErrorNotice } from '~/modules/common/error-notice';
import { PublicLayout } from '~/modules/common/public-layout';
import { Root } from '~/modules/common/root';
import { Spinner } from '~/modules/common/spinner';
import { meQueryOptions } from '~/modules/me/query';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers/get-menu-data';
import { unseenCountsQueryOptions } from '~/modules/seen/query';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { cleanupOnBoundaryChange } from '~/routes/boundary-cleanup';
import { useUserStore } from '~/store/user';
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
  component: () => <Root />,
  beforeLoad: async ({ matches, location }) => {
    // Enforce isAuth globally: if the leaf route requires auth, verify the user session
    const leafMatch = matches[matches.length - 1];
    if (!leafMatch?.staticData?.isAuth) return;

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
  errorComponent: ({ error }) => <ErrorNotice boundary="root" error={error} />,
  notFoundComponent: () => {
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
  },
});

/**
 * This is the layout for all public routes, for users without authentication. Marketing, auth pages and more.
 */
export const PublicLayoutRoute = createRoute({
  id: 'publicLayout',
  staticData: { isAuth: false, boundary: 'public' },
  getParentRoute: () => RootRoute,
  component: () => <PublicLayout />,
  beforeLoad: async ({ location, cause }) => {
    if (cause === 'enter') {
      // Clean up sheets/dialogs when entering public layout from different boundary
      cleanupOnBoundaryChange('public');
    }

    if (cause !== 'enter' || location.pathname === '/sign-out') return;

    try {
      console.debug('[PublicLayout] Fetching me while entering public page:', location.pathname);

      // Fetch and set user
      await queryClient.ensureQueryData({ ...meQueryOptions() });
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
        onError(error);
      }
    }
  },
});

/**
 * Layout for authenticated users requiring a valid user session.
 */
export const AppLayoutRoute = createRoute({
  id: 'appLayout',
  staticData: { isAuth: false, boundary: 'app' },
  getParentRoute: () => RootRoute,
  component: () => (
    <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
      <AppLayout />
    </Suspense>
  ),
  beforeLoad: async ({ location, cause }) => {
    if (cause === 'enter') {
      // Clean up sheets/dialogs when entering app layout from different boundary
      cleanupOnBoundaryChange('app');
    }

    if (cause !== 'enter') return;

    try {
      console.debug('[AppLayout] Fetching me before entering app:', location.pathname);

      // Try to use stored user, it will still revalidate below
      const storedUser = useUserStore.getState().user;
      if (storedUser) {
        console.info('Continuing user with session');
        return;
      }

      // Fetch and set user
      const user = await queryClient.ensureQueryData({ ...meQueryOptions() });
      return { user };
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
        onError(error);
      }

      // If root domain, treat as new user and go to about
      if (location.pathname === '/') throw redirect({ to: '/about', replace: true });

      console.info('Not authenticated -> redirect to sign in');

      const url = new URL(location.pathname, window.location.origin);
      const redirectPath = url.pathname + url.search;
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: redirectPath } });
    }

    // If location is root and has user, redirect to home
    if (location.pathname === '/') throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
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
      return await defer(getMenuData());
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
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
  component: () => <ErrorNotice boundary="public" />,
});
