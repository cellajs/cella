import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, createRoute, createRouteMask, redirect } from '@tanstack/react-router';

import { Root } from '~/modules/common/root';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

import { config } from 'config';
import { getMe, getUserMenu } from '~/api/users';

import App from '~/modules/common/app';
import ErrorNotice from '~/modules/common/error-notice';

import { AcceptRoute, AuthRoute, ResetPasswordRoute, SignInRoute, SignOutRoute, VerifyEmailRoute, VerifyEmailRouteWithToken } from './authentication';
import { HomeAliasRoute, HomeRoute } from './home';
import { AboutRoute, AccessibilityRoute, ContactRoute, PrivacyRoute, TermsRoute } from './marketing';
import { OrganizationRoute, organizationMembersRoute, organizationSettingsRoute, projectsRoute } from './organizations';
import { OrganizationsTableRoute, SystemPanelRoute, UsersTableRoute } from './system';
import { UserProfileRoute, UserSettingsRoute } from './users';

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
  beforeLoad: () => ({ getTitle: () => config.name }),
  component: () => <Root />,
});

const ErrorNoticeRoute = createRoute({
  path: '/error',
  beforeLoad: () => ({ getTitle: () => 'Error' }),
  getParentRoute: () => rootRoute,
  component: () => <ErrorNotice />,
});

export const IndexRoute = createRoute({
  id: 'layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ location, cause, context }) => {
    const lastUser = useUserStore.getState().lastUser;

    // If no stored user and no desired path, redirect to about
    if (location.pathname === '/' && !lastUser) throw redirect({ to: '/about', replace: true });

    try {
      // If just entered, fetch me and menu
      if (cause === 'enter') {
        const getMe = async () => {
          return context.queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
        };

        const getMenu = async () => {
          return context.queryClient.fetchQuery({ queryKey: ['menu'], queryFn: getAndSetMenu });
        };

        await Promise.all([getMe(), getMenu()]);
      }
    } catch {
      console.info('Not authenticated, redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { redirect: location.pathname } });
    }
  },
  component: () => <App />,
});

export const routeTree = rootRoute.addChildren([
  AboutRoute,
  ContactRoute,
  TermsRoute,
  PrivacyRoute,
  AccessibilityRoute,
  ErrorNoticeRoute,
  SignOutRoute,
  AuthRoute.addChildren([SignInRoute, AcceptRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken])]),
  IndexRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    OrganizationRoute.addChildren([organizationMembersRoute, organizationSettingsRoute, projectsRoute]),
  ]),
]);

export const VerifyEmailRouteWithTokenMask = createRouteMask({
  routeTree,
  from: '/auth/verify-email/$token',
  to: '/auth/verify-email',
  params: true,
});

export const routeMasks = [VerifyEmailRouteWithTokenMask];
