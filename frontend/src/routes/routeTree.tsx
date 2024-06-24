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

import { Loader2 } from 'lucide-react';
import { Suspense, lazy } from 'react';
import type { ApiError } from '~/api';
import { onError } from '~/lib/query-client';
import { AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailRouteWithToken } from './authentication';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from './home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from './marketing';
import { OrganizationMembersRoute, OrganizationRoute, OrganizationSettingsRoute } from './organizations';
import { OrganizationsTableRoute, RequestsTableRoute, SystemPanelRoute, UsersTableRoute } from './system';
import { UserProfileRoute, UserSettingsRoute } from './users';
import { WorkspaceBoardRoute, WorkspaceOverviewRoute, WorkspaceRoute, WorkspaceTableRoute } from './workspaces'; //WorkspaceMembersRoute,
import type { Organization, Project } from '~/types';

const App = lazy(() => import('~/modules/common/app'));

export const getAndSetMe = async () => {
  const user = await getSelf();
  useUserStore.getState().setUser(user);
  return user;
};

export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

export const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient;
  organization?: Organization;
  project?: Project;
}>()({
  staticData: { pageTitle: '' },
  component: () => <Root />,
});

const ErrorNoticeRoute = createRoute({
  path: '/error',
  staticData: { pageTitle: 'Error' },
  getParentRoute: () => rootRoute,
  component: () => <ErrorNotice />,
});

export const IndexRoute = createRoute({
  id: 'layout',
  staticData: { pageTitle: '' },
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ location, cause }) => {
    const lastUser = useUserStore.getState().lastUser;

    // If no stored user and no desired path, redirect to about
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
      // TODO but sentry and onError in a reusable wrapper to reuse it in frontend catch blocks
      Sentry.captureException(error);
      onError(error as ApiError);

      if (location.pathname.startsWith('/auth/')) return console.info('Not authenticated');

      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { fromRoot: true, redirect: location.pathname } });
    }
  },
  component: () => (
    <Suspense fallback={<Loader2 className="text-muted-foreground mx-auto mt-[40vh] h-10 w-10 animate-spin" />}>
      <App />
    </Suspense>
  ),
});

export const acceptInviteRoute = createRoute({
  path: '/auth/invite/$token',
  staticData: { pageTitle: 'Accept Invite' },
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

export const routeTree = rootRoute.addChildren([
  AboutRoute,
  ContactRoute,
  LegalRoute,
  AccessibilityRoute,
  ErrorNoticeRoute,
  SignOutRoute,
  AuthRoute.addChildren([SignInRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken]), acceptInviteRoute]),
  IndexRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute, RequestsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    WorkspaceRoute.addChildren([WorkspaceBoardRoute, WorkspaceTableRoute, WorkspaceOverviewRoute]),
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationSettingsRoute]),
  ]),
]);
