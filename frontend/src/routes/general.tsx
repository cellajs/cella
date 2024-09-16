import * as Sentry from '@sentry/react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';

import { Root } from '~/modules/common/root';
import { useUserStore } from '~/store/user';

import ErrorNotice from '~/modules/common/error-notice';

import { queryClient } from '~/lib/router';
import AcceptInvite from '~/modules/common/accept-invite';

import type { ErrorType } from 'backend/lib/errors';
import { Suspense, lazy } from 'react';
import type { ApiError } from '~/api';
import { onError } from '~/lib/query-client';
import { Public } from '~/modules/common/public';
import Spinner from '~/modules/common/spinner';
import UnsubscribePage from '~/modules/common/unsubscribe-page';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { AuthRoute } from './auth';

// Lazy load main App component, which is behind authentication
const App = lazy(() => import('~/modules/common/app'));

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
});

export const ErrorNoticeRoute = createRoute({
  path: '/error',
  staticData: { pageTitle: 'Error', isAuth: false },
  getParentRoute: () => rootRoute,
  component: () => <ErrorNotice />,
});

export const AppRoute = createRoute({
  id: 'layout',
  staticData: { pageTitle: '', isAuth: false },
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ location, cause }) => {
    const lastUser = useUserStore.getState().lastUser;

    // If no stored user and no path requested, redirect to about
    if (location.pathname === '/' && !lastUser) throw redirect({ to: '/about', replace: true });

    if (cause !== 'enter') return;

    // If just entered, fetch me and menu
    try {
      const getSelf = async () => {
        return queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
      };

      const getMenu = async () => {
        return queryClient.fetchQuery({ queryKey: ['menu'], queryFn: getAndSetMenu });
      };

      await Promise.all([getSelf(), getMenu()]);
    } catch (error) {
      // TODO put sentry and onError in a reusable wrapper to reuse it in frontend catch blocks
      Sentry.captureException(error);
      onError(error as ApiError);

      if (location.pathname.startsWith('/auth/')) return console.info('Not authenticated');

      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { fromRoot: true, redirect: location.pathname } });
    }
  },
  component: () => (
    <Suspense fallback={<Spinner />}>
      <App />
    </Suspense>
  ),
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
