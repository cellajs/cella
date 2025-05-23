import * as Sentry from '@sentry/react';
import { onlineManager } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, defer, redirect } from '@tanstack/react-router';
import { config } from 'config';
import i18n from 'i18next';
import { Suspense, lazy } from 'react';
import { z } from 'zod';
import ErrorNotice from '~/modules/common/error-notice';
import { PublicLayout } from '~/modules/common/public-layout';
import { Root } from '~/modules/common/root';
import Spinner from '~/modules/common/spinner';
import { meQueryOptions, menuQueryOptions } from '~/modules/me/query';
import { onError } from '~/query/on-error';
import { queryClient } from '~/query/query-client';
import { useUserStore } from '~/store/user';

// Lazy load main App component, which is behind authentication
const AppLayout = lazy(() => import('~/modules/common/app-layout'));

const errorSearchSchema = z.object({
  error: z.string().optional(),
  severity: z.enum(config.severityLevels).optional(),
});

export const rootRoute = createRootRouteWithContext()({
  staticData: { pageTitle: '', isAuth: false },
  component: () => <Root />,
  errorComponent: ({ error }) => <ErrorNotice level="root" error={error} />,
  notFoundComponent: () => {
    return (
      <ErrorNotice
        error={{
          type: 'page_not_found',
          severity: 'info',
          status: 404,
          name: 'NotFoundError',
          message: i18n.t('error:page_not_found'),
        }}
        level="root"
      />
    );
  },
});

export const PublicRoute = createRoute({
  id: 'public-layout',
  staticData: { pageTitle: '', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <PublicLayout />,
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter' || location.pathname === '/sign-out') return;

    try {
      console.debug('Fetch me & menu in while entering public page ', location.pathname);

      // Fetch and set user
      await queryClient.ensureQueryData({ ...meQueryOptions(), revalidateIfStale: true });
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
        onError(error);
      }
    }
  },
});

export const AppRoute = createRoute({
  id: 'app-layout',
  staticData: { pageTitle: '', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => (
    <Suspense fallback={<Spinner className="mt-[45vh] h-10 w-10" />}>
      <AppLayout />
    </Suspense>
  ),
  loader: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('Fetch me & menu while entering app ', location.pathname);

      // If offline, try to use stored user
      const storedUser = useUserStore.getState().user;
      if (!onlineManager.isOnline() && storedUser) {
        console.info('Continuing as offline user with session');
        return;
      }

      // Fetch and set user
      const user = await queryClient.ensureQueryData({ ...meQueryOptions(), revalidateIfStale: true });

      // Defer menu loading (won't block rendering)
      if (user)
        return {
          menuData: await defer(queryClient.ensureQueryData({ ...menuQueryOptions(), revalidateIfStale: true })),
        };
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
        onError(error);
      }

      // If root domain, treat as new user and go to about
      if (location.pathname === '/') throw redirect({ to: '/about', replace: true });

      console.info('Not authenticated -> redirect to sign in');
      throw redirect({ to: '/auth/authenticate', search: { fromRoot: true, redirect: location.pathname } });
    }

    // If location is root and has user, redirect to home
    if (location.pathname === '/') throw redirect({ to: config.defaultRedirectPath, replace: true });
  },
});

export const ErrorNoticeRoute = createRoute({
  path: '/error',
  validateSearch: errorSearchSchema,
  staticData: { pageTitle: 'Error', isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <ErrorNotice level="public" />,
});
