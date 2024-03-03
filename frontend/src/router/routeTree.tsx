import { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, createRoute, createRouteMask, notFound, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { acceptInvite, checkInvite } from '~/api/authentication';
import VerifyEmail from '~/modules/auth/verify-email';
import { Root } from '~/modules/common/root';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

import AcceptInvite from '~/modules/auth/accept-invite';
import ResetPassword from '~/modules/auth/reset-password';
import SignIn from '~/modules/auth/sign-in';
import SignOut from '~/modules/auth/sign-out';
import App from '~/modules/common/app';
import ErrorPage from '~/modules/common/error';
import Home from '~/modules/home';
import About from '~/modules/marketing/about';
import Accessibility from '~/modules/marketing/accessibility';
import Contact from '~/modules/marketing/contact';
import { Privacy } from '~/modules/marketing/privacy';
import { Terms } from '~/modules/marketing/terms';
import { membersQueryOptions } from '~/modules/organizations/members-table';
import Organization, { organizationQueryOptions } from '~/modules/organizations/organization';
import OrganizationsTable from '~/modules/organizations/organizations-table';
import SystemPanel from '~/modules/system/system-panel';
import { UserProfile, userQueryOptions } from '~/modules/users/user-profile';
import UserSettings from '~/modules/users/user-settings';
import UsersTable from '~/modules/users/users-table';

const UsersSearchSchema = z.object({
  q: z.string().catch('').optional(),
  sort: z.enum(['id', 'name', 'email', 'role', 'createdAt', 'membershipCount']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
  role: z.enum(['admin', 'user']).catch('user').optional(),
});

export type UsersSearch = z.infer<typeof UsersSearchSchema>;

const organizationsSearchSchema = z.object({
  q: z.string().catch('').optional(),
  sort: z.enum(['name', 'id', 'createdAt', 'userRole']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
});

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;

const membersSearchSchema = z.object({
  q: z.string().catch('').optional(),
  role: z.enum(['admin', 'member']).catch('member').optional(),
  sort: z.enum(['name', 'id', 'email', 'lastSeenAt', 'createdAt', 'organizationRole']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
});

export type MembersSearch = z.infer<typeof membersSearchSchema>;

const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const AcceptRoute = createRoute({
  path: '/auth/accept-invite/$token',
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ params: { token } }) => {
    const isInviteExists = await checkInvite(token);

    if (isInviteExists) {
      const organizationIdentifier = await acceptInvite({
        token,
      });

      throw redirect({
        to: '/$organizationIdentifier/$tab',
        params: { organizationIdentifier, tab: 'members' },
      });
    }
  },
  component: () => <AcceptInvite />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const ResetPasswordRoute = createRoute({
  path: '/auth/reset-password/$token',
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = createRoute({
  path: '/auth/verify-email',
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const VerifyEmailRouteWithToken = createRoute({
  path: '/auth/verify-email/$token',
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-out',
  component: SignOut,
});

const AboutRoute = createRoute({
  path: '/about',
  getParentRoute: () => rootRoute,
  component: () => <About />,
});

const ContactRoute = createRoute({
  path: '/contact',
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

const TermsRoute = createRoute({
  path: '/terms',
  getParentRoute: () => rootRoute,
  component: () => <Terms />,
});

const PrivacyRoute = createRoute({
  path: '/privacy',
  getParentRoute: () => rootRoute,
  component: () => <Privacy />,
});

const AccessibilityRoute = createRoute({
  path: '/accessibility',
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});

const ErrorPageRoute = createRoute({
  path: '/error',
  getParentRoute: () => rootRoute,
  component: () => <ErrorPage />,
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
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

// We need an alias for '/' to forward users better if coming from backend
const HomeAliasRoute = createRoute({
  path: '/home',
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

const SystemPanelRoute = createRoute({
  path: '/system',
  getParentRoute: () => IndexRoute,
  component: () => <SystemPanel />,
});

export const UsersTableRoute = createRoute({
  path: '/',
  getParentRoute: () => SystemPanelRoute,
  component: () => <UsersTable />,
  validateSearch: UsersSearchSchema,
});

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  getParentRoute: () => SystemPanelRoute,
  component: () => <OrganizationsTable />,
  validateSearch: organizationsSearchSchema,
});

export const UserProfileRoute = createRoute({
  path: '/user/$userIdentifier',
  getParentRoute: () => IndexRoute,
  loader: async ({ context: { queryClient }, params: { userIdentifier } }) => {
    queryClient.ensureQueryData(userQueryOptions(userIdentifier));
  },
  errorComponent: ({ error }) => <ErrorPage error={error as Error} />,
  component: () => <UserProfile />,
});

const UserSettingsRoute = createRoute({
  path: '/user/settings',
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});

const OrganizationRedirectRoute = createRoute({
  path: '/$organizationIdentifier',
  getParentRoute: () => IndexRoute,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$organizationIdentifier/$tab',
      replace: true,
      params: {
        ...params,
        tab: 'members',
      },
    });
  },
});

export const OrganizationRoute = createRoute({
  path: '$organizationIdentifier/$tab',
  getParentRoute: () => IndexRoute,
  beforeLoad: ({ params }) => {
    if (![undefined, 'members', 'settings'].includes(params.tab)) {
      throw notFound();
    }
  },
  validateSearch: membersSearchSchema,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: async ({ context: { queryClient }, params: { organizationIdentifier, tab }, deps: { q, sort, order, role } }) => {
    queryClient.ensureQueryData(organizationQueryOptions(organizationIdentifier));

    // Ensure members query
    if (tab === 'members') {
      const membersInfiniteQueryOptions = membersQueryOptions({ organizationIdentifier, q, sort, order, role });
      const cachedMembers = queryClient.getQueryData(membersInfiniteQueryOptions.queryKey);
      if (!cachedMembers) {
        queryClient.fetchInfiniteQuery(membersInfiniteQueryOptions);
      }
    }
  },
  errorComponent: ({ error }) => <ErrorPage error={error as Error} />,
  component: () => <Organization />,
});

export const routeTree = rootRoute.addChildren([
  AboutRoute,
  ContactRoute,
  TermsRoute,
  PrivacyRoute,
  AccessibilityRoute,
  ErrorPageRoute,
  SignOutRoute,
  AuthRoute.addChildren([SignInRoute, AcceptRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken])]),
  IndexRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    OrganizationRedirectRoute,
    OrganizationRoute,
  ]),
]);

export const VerifyEmailRouteWithTokenMask = createRouteMask({
  routeTree,
  from: '/auth/verify-email/$token',
  to: '/auth/verify-email',
  params: true,
});

export const routeMasks = [VerifyEmailRouteWithTokenMask];
