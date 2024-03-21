import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, createRoute, createRouteMask, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import VerifyEmail from '~/modules/auth/verify-email';
import { Root } from '~/modules/common/root';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

import type { ErrorType } from 'backend/lib/errors';
import { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { getUsersByOrganizationQuerySchema } from 'backend/modules/organizations/schema';
import { getUsersQuerySchema } from 'backend/modules/users/schema';
import { Suspense } from 'react';
import AcceptInvite from '~/modules/auth/accept-invite';
import ResetPassword from '~/modules/auth/reset-password';
import SignIn from '~/modules/auth/sign-in';
import SignOut from '~/modules/auth/sign-out';
import App from '~/modules/common/app';
import ErrorNotice from '~/modules/common/error-notice';
import Projects from '~/modules/common/projects';
import Home from '~/modules/home';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { Privacy } from '~/modules/marketing/privacy';
import { Terms } from '~/modules/marketing/terms';
import MembersTable, { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationSettings from '~/modules/organizations/organization-settings';
import OrganizationsTable from '~/modules/organizations/organizations-table';
import SystemPanel from '~/modules/system/system-panel';
import { UserProfile, userQueryOptions } from '~/modules/users/user-profile';
import UserSettings from '~/modules/users/user-settings';
import UsersTable from '~/modules/users/users-table';

const usersSearchSchema = getUsersQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export type UsersSearch = z.infer<typeof getUsersQuerySchema>;

const organizationsSearchSchema = getOrganizationsQuerySchema.pick({ q: true, sort: true, order: true });

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;

const membersSearchSchema = getUsersByOrganizationQuerySchema.pick({ q: true, sort: true, order: true, role: true });

export type MembersSearch = z.infer<typeof getUsersByOrganizationQuerySchema>;

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  beforeLoad: () => ({ getTitle: () => 'CellaJS' }),
  component: () => <Root />,
});

const AuthRoute = createRoute({
  id: 'auth-layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async () => {
    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (storedUser) throw redirect({ to: '/', replace: true });

    try {
      const getMe = useUserStore.getState().getMe;
      await getMe();
    } catch (error) {
      return console.error('Not authenticated');
    }

    // If authenticated, redirect to home
    console.info('Authenticated, go to home');
    throw redirect({ to: '/', replace: true });
  },
  component: () => <Outlet />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  beforeLoad: () => ({ getTitle: () => 'Sign In' }),
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const AcceptRoute = createRoute({
  path: '/auth/accept-invite/$token',
  beforeLoad: () => ({ getTitle: () => 'Accept Invite' }),
  getParentRoute: () => AuthRoute,
  component: () => <AcceptInvite />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const ResetPasswordRoute = createRoute({
  path: '/auth/reset-password/$token',
  beforeLoad: () => ({ getTitle: () => 'Reset Password' }),
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = createRoute({
  path: '/auth/verify-email',
  beforeLoad: () => ({ getTitle: () => 'Verify Email' }),
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const VerifyEmailRouteWithToken = createRoute({
  path: '/auth/verify-email/$token',
  beforeLoad: () => ({ getTitle: () => 'Verify Email' }),
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: () => ({ getTitle: () => 'Sign Out' }),
  path: '/sign-out',
  component: SignOut,
});

const AboutRoute = createRoute({
  path: '/about',
  beforeLoad: () => ({ getTitle: () => 'About' }),
  getParentRoute: () => rootRoute,
  component: () => <About />,
});

const ContactRoute = createRoute({
  path: '/contact',
  beforeLoad: () => ({ getTitle: () => 'Contact' }),
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

const TermsRoute = createRoute({
  path: '/terms',
  beforeLoad: () => ({ getTitle: () => 'Terms' }),
  getParentRoute: () => rootRoute,
  component: () => <Terms />,
});

const PrivacyRoute = createRoute({
  path: '/privacy',
  beforeLoad: () => ({ getTitle: () => 'Privacy' }),
  getParentRoute: () => rootRoute,
  component: () => <Privacy />,
});

const AccessibilityRoute = createRoute({
  path: '/accessibility',
  beforeLoad: () => ({ getTitle: () => 'Accessibility' }),
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});

const ErrorNoticeRoute = createRoute({
  path: '/error',
  beforeLoad: () => ({ getTitle: () => 'Error' }),
  getParentRoute: () => rootRoute,
  component: () => <ErrorNotice />,
});

const IndexRoute = createRoute({
  id: 'layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ location, cause }) => {
    const lastUser = useUserStore.getState().lastUser;

    // If no stored user and no desired path, redirect to about
    if (location.pathname === '/' && !lastUser) throw redirect({ to: '/about', replace: true });

    try {
      const { getMe } = useUserStore.getState();
      const { getMenu } = useNavigationStore.getState();

      if (cause === 'enter') {
        await Promise.all([getMe(), getMenu()]);
      }
    } catch {
      console.info('Not authenticated, redirect to sign in');
      throw redirect({ to: '/auth/sign-in', replace: true, search: { redirect: location.pathname } });
    }
  },
  component: () => <App />,
});

const HomeRoute = createRoute({
  path: '/',
  beforeLoad: () => ({ getTitle: () => 'Home' }),
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
const HomeAliasRoute = createRoute({
  beforeLoad: () => ({ getTitle: () => 'Home' }),
  path: '/home',
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

const SystemPanelRoute = createRoute({
  path: '/system',
  beforeLoad: ({ location }) => {
    if (location.pathname === '/system') {
      throw redirect({ to: '/system/', replace: true });
    }
    return { getTitle: () => 'System' };
  },
  getParentRoute: () => IndexRoute,
  component: () => <SystemPanel />,
});

export const UsersTableRoute = createRoute({
  path: '/',
  beforeLoad: () => ({ getTitle: () => 'Users' }),
  getParentRoute: () => SystemPanelRoute,
  component: () => <UsersTable />,
  validateSearch: usersSearchSchema,
});

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  beforeLoad: () => ({ getTitle: () => 'Organizations' }),
  getParentRoute: () => SystemPanelRoute,
  component: () => <OrganizationsTable />,
  validateSearch: organizationsSearchSchema,
});

export const UserProfileRoute = createRoute({
  path: '/user/$userIdentifier',
  getParentRoute: () => IndexRoute,
  beforeLoad: ({ params: { userIdentifier } }) => ({ getTitle: () => userIdentifier }),
  loader: async ({ context: { queryClient }, params: { userIdentifier } }) => {
    queryClient.ensureQueryData(userQueryOptions(userIdentifier));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <UserProfile />
    </Suspense>
  ),
});

const UserSettingsRoute = createRoute({
  path: '/user/settings',
  beforeLoad: () => ({ getTitle: () => 'Settings' }),
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});

export const OrganizationRoute = createRoute({
  path: '$organizationIdentifier',
  getParentRoute: () => IndexRoute,
  validateSearch: membersSearchSchema,
  beforeLoad: ({ location, params }) => {
    // redirect to members table
    if (!location.pathname.split('/')[2]) {
      throw redirect({ to: '/$organizationIdentifier/members', replace: true, params });
    }

    return { getTitle: () => params.organizationIdentifier };
  },
  loader: async ({ context: { queryClient }, params: { organizationIdentifier } }) => {
    queryClient.ensureQueryData(organizationQueryOptions(organizationIdentifier));
  },
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,
  component: () => (
    <Suspense>
      <Organization />
    </Suspense>
  ),
});

export const organizationMembersRoute = createRoute({
  path: '/members',
  getParentRoute: () => OrganizationRoute,
  validateSearch: membersSearchSchema,
  beforeLoad: () => ({ getTitle: () => 'Members' }),
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ context: { queryClient }, params: { organizationIdentifier }, deps: { q, sort, order, role } }) => {
    const membersInfiniteQueryOptions = membersQueryOptions({ organizationIdentifier, q, sort, order, role });
    const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
    if (!cachedMembers) {
      queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
    }
  },
  component: () => <MembersTable />,
});

export const organizationSettingsRoute = createRoute({
  path: '/settings',
  beforeLoad: () => ({ getTitle: () => 'Settings' }),
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});

export const projectsRoute = createRoute({
  path: '/projects',
  beforeLoad: () => ({ getTitle: () => 'Projects' }),
  getParentRoute: () => OrganizationRoute,
  component: () => <Projects />,
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
