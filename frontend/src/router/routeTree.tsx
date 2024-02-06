import { DefaultError, QueryClient, infiniteQueryOptions, queryOptions, useMutation } from '@tanstack/react-query';
import { Outlet, createRoute, createRouteMask, redirect, rootRouteWithContext } from '@tanstack/react-router';
import { z } from 'zod';
import { UpdateOrganizationParams, getMembersByOrganizationIdentifier, getOrganizationBySlugOrId, updateOrganization } from '~/api/organizations';
import { UpdateUserParams, updateUser } from '~/api/users';
import { Root } from '~/components/root';
import VerifyEmail from '~/modules/auth/verify-email';
import { useUserStore } from '~/store/user';
import { queryClient } from '.';
import App from '../components/app';
import ErrorPage from '../components/error';
import MembersTable from '../components/members-table';
import OrganizationsTable from '../components/organizations-table';
import UsersTable from '../components/users-table';
import AcceptInvite from '../modules/auth/accept-invite';
import ResetPassword from '../modules/auth/reset-password';
import SignIn from '../modules/auth/sign-in';
import SignOut from '../modules/auth/sign-out';
import Home from '../modules/home';
import About from '../modules/marketing/about';
import Accessibility from '../modules/marketing/accessibility';
import Contact from '../modules/marketing/contact';
import { Privacy } from '../modules/marketing/privacy';
import { Terms } from '../modules/marketing/terms';
import Organization from '../modules/organizations/organization';
import OrganizationSettings from '../modules/organizations/organization-settings';
import SystemPanel from '../modules/system-panel';
import UserProfile from '../modules/users/user-profile';
import UserSettings from '../modules/users/user-settings';
import { Organization as OrganizationType, User } from '../types';
import { acceptInvite, checkInvite } from '~/api/general';

const rootRoute = rootRouteWithContext<{
  queryClient: QueryClient;
}>()({
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
    console.log('Authenticated, go to home');
    throw redirect({ to: '/', replace: true });
  },
  component: () => <Outlet />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
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
        to: '/$organizationIdentifier',
        params: { organizationIdentifier },
      });
    }
  },
  component: () => <AcceptInvite />,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
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

export const useUpdateUserMutation = (userIdentifier: string) => {
  return useMutation<User, DefaultError, UpdateUserParams>({
    mutationKey: ['me', 'update', userIdentifier],
    mutationFn: (params) => updateUser(userIdentifier, params),
    onSuccess: () => queryClient.invalidateQueries(),
    gcTime: 1000 * 10,
  });
};

const IndexRoute = createRoute({
  id: 'layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ location }) => {
    const storedUser = useUserStore.getState().user;

    if (!storedUser) {
      // If no stored user and no desired path, redirect to about
      if (location.pathname === '/') throw redirect({ to: '/about', replace: true });

      try {
        const getMe = useUserStore.getState().getMe;
        await getMe();
      } catch {
        console.log('Not authenticated, redirect to sign in');
        throw redirect({ to: '/auth/sign-in', replace: true, search: { redirect: location.pathname } });
      }
    }
  },
  component: () => <App />,
});

const HomeRoute = createRoute({
  path: '/',
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

// We need an alias to forward users better if coming from the backend
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

const UsersSearchSchema = z.object({
  q: z.string().catch('').optional(),
  sort: z.enum(['name', 'id', 'email', 'lastSeenAt', 'createdAt', 'userRole']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
  role: z.enum(['admin', 'user']).catch('user').optional(),
});

export type UsersSearch = z.infer<typeof UsersSearchSchema>;

export const UsersTableRoute = createRoute({
  path: '/',
  getParentRoute: () => SystemPanelRoute,
  component: () => <UsersTable />,
  validateSearch: UsersSearchSchema,
});

const organizationsSearchSchema = z.object({
  q: z.string().catch('').optional(),
  sort: z.enum(['name', 'id', 'createdAt', 'userRole']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
});

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;

export const OrganizationsTableRoute = createRoute({
  path: '/organizations',
  getParentRoute: () => SystemPanelRoute,
  component: () => <OrganizationsTable />,
  validateSearch: organizationsSearchSchema,
});

const UserProfileRoute = createRoute({
  path: '/user/$userIdentifier',
  getParentRoute: () => IndexRoute,
  component: () => <UserProfile />,
});

const UserSettingsRoute = createRoute({
  path: '/user/settings',
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});

export const organizationQueryOptions = (organizationIdentifier: string) =>
  queryOptions({
    queryKey: ['organizations', organizationIdentifier],
    queryFn: () => getOrganizationBySlugOrId(organizationIdentifier),
  });

export const useUpdateOrganizationMutation = (organizationIdentifier: string) => {
  return useMutation<OrganizationType, DefaultError, UpdateOrganizationParams>({
    mutationKey: ['organizations', 'update', organizationIdentifier],
    mutationFn: (params) => updateOrganization(organizationIdentifier, params),
    onSuccess: () => queryClient.invalidateQueries(),
    gcTime: 1000 * 10,
  });
};

const OrganizationRoute = createRoute({
  path: '$organizationIdentifier',
  getParentRoute: () => IndexRoute,
  beforeLoad: ({ location, params }) => {
    // refirect to members table
    if (!location.pathname.split('/')[2]) {
      throw redirect({ to: '/$organizationIdentifier/members', replace: true, params });
    }
  },
  loader: ({ context: { queryClient }, params: { organizationIdentifier } }) =>
    queryClient.ensureQueryData(organizationQueryOptions(organizationIdentifier)),
  errorComponent: ({ error }) => <ErrorPage error={error as Error} />,
  component: () => <Organization />,
});

const memberSearchSchema = z.object({
  q: z.string().catch('').optional(),
  role: z.enum(['admin', 'member']).catch('member').optional(),
  sort: z.enum(['name', 'id', 'email', 'lastSeenAt', 'createdAt', 'organizationRole']).catch('name').optional(),
  order: z.enum(['asc', 'desc']).catch('asc').optional(),
});

export type MemberSearch = z.infer<typeof memberSearchSchema>;

export const membersQueryOptions = ({
  organizationIdentifier,
  q,
  sort,
  order,
  role,
}: {
  organizationIdentifier: string;
  q?: string;
  sort?: MemberSearch['sort'];
  order?: MemberSearch['order'];
  role?: MemberSearch['role'];
}) =>
  infiniteQueryOptions({
    queryKey: ['members', organizationIdentifier, q, sort, order, role],
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      const fetchedData = await getMembersByOrganizationIdentifier(
        organizationIdentifier,
        {
          page: pageParam,
          q,
          sort,
          order,
          role,
        },
        signal,
      );

      return fetchedData;
    },
    getNextPageParam: (_lastGroup, groups) => groups.length,
    refetchOnWindowFocus: false,
  });

export const MembersTableRoute = createRoute({
  path: '/members',
  getParentRoute: () => OrganizationRoute,
  component: () => <MembersTable />,
  validateSearch: memberSearchSchema,
  loaderDeps: ({ search: { q, sort, order, role } }) => ({ q, sort, order, role }),
  loader: ({ context: { queryClient }, params: { organizationIdentifier }, deps: { q, sort, order, role } }) =>
    queryClient.ensureQueryData(membersQueryOptions({ organizationIdentifier, q, sort, order, role })),
  pendingComponent: () => null,
});

const OrganizationSettingsRoute = createRoute({
  path: '/settings',
  getParentRoute: () => OrganizationRoute,
  component: () => <OrganizationSettings />,
});

export const routeTree = rootRoute.addChildren([
  AboutRoute,
  ContactRoute,
  TermsRoute,
  PrivacyRoute,
  AccessibilityRoute,
  ErrorPageRoute,
  AuthRoute.addChildren([SignInRoute, AcceptRoute, ResetPasswordRoute, VerifyEmailRoute.addChildren([VerifyEmailRouteWithToken])]),
  SignOutRoute,
  IndexRoute.addChildren([
    HomeRoute,
    HomeAliasRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    OrganizationRoute.addChildren([MembersTableRoute, OrganizationSettingsRoute]),
  ]),
]);

export const VerifyEmailRouteWithTokenMask = createRouteMask({
  routeTree,
  from: '/auth/verify-email/$token',
  to: '/auth/verify-email',
  params: true,
});

export const routeMasks = [VerifyEmailRouteWithTokenMask];
