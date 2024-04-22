import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouteMask, redirect } from '@tanstack/react-router';

import { Root } from '~/modules/common/root';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

import { getMe, getUserMenu } from '~/api/users';

import App from '~/modules/common/app';
import ErrorNotice from '~/modules/common/error-notice';

import { queryClient } from '~/lib/router';
import { AcceptRoute, AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailRouteWithToken } from './authentication';
import { HomeAliasRoute, HomeRoute, WelcomeRoute } from './home';
import { AboutRoute, AccessibilityRoute, ContactRoute, LegalRoute } from './marketing';
import { OrganizationRoute, OrganizationMembersRoute, OrganizationSettingsRoute } from './organizations';
import { WorkspaceRoute, WorkspaceProjectsRoute } from './workspaces'; //WorkspaceMembersRoute, WorkspaceSettingsRoute,
import { OrganizationsTableRoute, SystemPanelRoute, UsersTableRoute } from './system';
import { UserProfileRoute, UserSettingsRoute } from './users';
import AcceptInvite from '~/modules/common/accept-invite';

export const getAndSetMe = async () => {
  const user = await getMe();
  useUserStore.getState().setUser(user);
  return user;
};

export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

export const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
      const getMe = async () => {
        return queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
      };

      const getMenu = async () => {
        return queryClient.fetchQuery({ queryKey: ['menu'], queryFn: getAndSetMenu });
      };

      await Promise.all([getMe(), getMenu()]);
    } catch {
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { fromRoot: true, redirect: location.pathname } });
    }
  },
  component: () => <App />,
});

export const acceptInviteRoute = createRoute({
  path: '/accept-invite/$token',
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
  AuthRoute.addChildren([SignInRoute, AcceptRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken]), acceptInviteRoute]),
  IndexRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    WelcomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    WorkspaceRoute.addChildren([WorkspaceProjectsRoute]), // WorkspaceMembersRoute, WorkspaceSettingsRoute
    OrganizationRoute.addChildren([OrganizationMembersRoute, OrganizationSettingsRoute]),
  ]),
]);

export const VerifyEmailRouteWithTokenMask = createRouteMask({
  routeTree,
  from: '/auth/verify-email/$token',
  to: '/auth/verify-email',
  params: true,
});

export const routeMasks = [VerifyEmailRouteWithTokenMask];
