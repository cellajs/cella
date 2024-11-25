import * as Sentry from '@sentry/react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';

import { Root } from '~/modules/common/root';

import ErrorNotice from '~/modules/common/error-notice';

import { queryClient } from '~/lib/router';
import AcceptInvite from '~/modules/common/accept-invite';

import { config } from 'config';
import { Suspense, lazy } from 'react';
import { offlineFetch, onError } from '~/lib/query-client';
import { Public } from '~/modules/common/public';
import Spinner from '~/modules/common/spinner';
import UnsubscribePage from '~/modules/common/unsubscribe-page';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { ErrorType } from '#/lib/errors';
import { AuthRoute } from './auth';

// Lazy load main App component, which is behind authentication
const App = lazy(() => import('~/modules/common/main-app'));

export const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  staticData: { pageTitle: '', isAuth: false },
  component: () => <Root />,
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
});

export const PublicRoute = createRoute({
  id: 'public-layout',
  staticData: { pageTitle: '', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <Public />,
  beforeLoad: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('Fetch me & menu in while entering public page ', location.pathname);
      const getSelf = async () => {
        return queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe, retry: 0 });
      };

      const getMenu = async () => {
        return queryClient.fetchQuery({ queryKey: ['menu'], queryFn: getAndSetMenu, retry: 0 });
      };

      await Promise.all([getSelf(), getMenu()]);
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
    <Suspense fallback={<Spinner />}>
      <App />
    </Suspense>
  ),
  loader: async ({ location, cause }) => {
    if (cause !== 'enter') return;

    try {
      console.debug('Fetch me & menu while entering app ', location.pathname);
      const getSelf = async () => {
        const queryKey = ['me'];
        return offlineFetch({ queryKey, queryFn: getAndSetMe });
      };

      const getMenu = async () => {
        const queryKey = ['menu'];
        return offlineFetch({ queryKey, queryFn: getAndSetMenu });
      };

      await Promise.all([getSelf(), getMenu()]);
    } catch (error) {
      if (error instanceof Error) {
        Sentry.captureException(error);
        onError(error);
      }

      if (location.pathname === '/') throw redirect({ to: '/about', replace: true });

      console.info('Not authenticated -> redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { fromRoot: true, redirect: location.pathname } });
    }

    // If location is root and has user, redirect to home
    if (location.pathname === '/') throw redirect({ to: config.defaultRedirectPath, replace: true });
  },
});

export const ErrorNoticeRoute = createRoute({
  path: '/error',
  staticData: { pageTitle: 'Error', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <ErrorNotice />,
});

export const acceptInviteRoute = createRoute({
  path: '/auth/invite/$token',
  staticData: { pageTitle: 'Accept invite', isAuth: true },
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ params }) => {
    try {
      await queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
    } catch {
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({
        to: '/auth/sign-in',
        replace: true,
        search: { fromRoot: true, token: params.token },
      });
    }
  },
  component: () => <AcceptInvite />,
});

export const UnsubscribeRoute = createRoute({
  path: '/unsubscribe',
  staticData: { pageTitle: 'Unsubscribe', isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <UnsubscribePage />,
});
