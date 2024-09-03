import * as Sentry from '@sentry/react';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, redirect } from '@tanstack/react-router';

import { Root } from '~/modules/common/root';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

import { getSelf, getUserMenu } from '~/api/me';

import ErrorNotice from '~/modules/common/error-notice';

import { queryClient } from '~/lib/router';
import AcceptInvite from '~/modules/common/accept-invite';

import { Suspense, lazy } from 'react';
import type { ApiError } from '~/api';
import { onError } from '~/lib/query-client';
import { Public } from '~/modules/common/public';
import Spinner from '~/modules/common/spinner';
import UnsubscribePage from '~/modules/common/unsubscribe-page';
import { AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailRouteWithToken } from '~/routes/authentication';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from '~/routes/home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from '~/routes/marketing';
import { OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from '~/routes/organizations';
import { MetricsRoute, OrganizationsTableRoute, RequestsTableRoute, SystemPanelRoute, UsersTableRoute } from '~/routes/system';
import { UserProfileRoute, UserSettingsRoute } from '~/routes/users';
import { WorkspaceBoardRoute, WorkspaceOverviewRoute, WorkspaceRoute, WorkspaceTableRoute } from '~/routes/workspaces'; //WorkspaceMembersRoute,
import type { ErrorType } from '#/lib/errors';

// Lazy load main App component, which is behind authentication
const App = lazy(() => import('~/modules/common/app'));

export const getAndSetMe = async () => {
  const user = await getSelf();
  const currentSession = user.sessions.find((s) => s.isCurrent);
  // if impersonation session don't change the last user
  if (currentSession?.type === 'impersonation') useUserStore.getState().setUserWithoutSetLastUser(user);
  else useUserStore.getState().setUser(user);

  return user;
};

export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

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

const ErrorNoticeRoute = createRoute({
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
  staticData: { pageTitle: 'Accept Invite', isAuth: true },
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

export const newsletterUnsubscribeRoute = createRoute({
  path: '/newsletter-unsubscribe',
  staticData: { pageTitle: 'Unsubscribe from newsletter', isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <UnsubscribePage />,
});

export const routeTree = rootRoute.addChildren([
  PublicRoute.addChildren([
    AboutRoute,
    newsletterUnsubscribeRoute,
    ContactRoute,
    LegalRoute,
    AccessibilityRoute,
    ErrorNoticeRoute,
    SignOutRoute,
    AuthRoute.addChildren([SignInRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken]), acceptInviteRoute]),
  ]),
  AppRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute, MetricsRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    WorkspaceRoute.addChildren([WorkspaceBoardRoute, WorkspaceTableRoute, WorkspaceOverviewRoute]),
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationSettingsRoute]),
  ]),
]);
