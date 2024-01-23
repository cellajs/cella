import { DefaultError, QueryClient, queryOptions, useMutation } from '@tanstack/react-query';
import { Outlet, Route, redirect, rootRouteWithContext } from '@tanstack/react-router';
import { z } from 'zod';
import {
  UpdateOrganizationParams,
  UpdateUserParams,
  acceptOrganizationInvite,
  checkIsEmailExistsByInviteToken,
  getOrganizationBySlugOrId,
  updateOrganization,
  updateUser,
} from '~/api/api';
import { Root } from '~/components/root';
import VerifyEmail from '~/pages/auth/verify-email';
import { useUserStore } from '~/store/user';
import { queryClient } from '.';
import App from '../components/app';
import MembersTable from '../components/members-table';
import OrganizationSettings from '../components/organization-settings';
import OrganizationsTable from '../components/organizations-table';
import UsersTable from '../components/users-table';
import About from '../pages/about';
import AcceptInvite from '../pages/auth/accept-invite';
import ResetPassword from '../pages/auth/reset-password';
import SignIn from '../pages/auth/sign-in';
import SignOut from '../pages/auth/sign-out';
import ErrorPage from '../pages/error';
import Home from '../pages/home';
import Organization from '../pages/organization';
import Accessibility from '../pages/other/accessibility';
import Contact from '../pages/other/contact';
import Privacy from '../pages/other/privacy';
import Terms from '../pages/other/terms';
import SystemPanel from '../pages/system-panel';
import UserProfile from '../pages/user-profile';
import UserSettings from '../pages/user-settings';
import { Organization as OrganizationType, User } from '../types';

const rootRoute = rootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  component: () => <Root />,
});

const AuthRoute = new Route({
  id: 'auth-layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async () => {
    const getMe = useUserStore.getState().getMe;

    const user = await getMe();

    // redirect to / if signed in
    if (user) {
      throw redirect({ to: '/', replace: true });
    }
  },
  component: () => <Outlet />,
});

export const SignInRoute = new Route({
  path: '/auth/sign-in',
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({
    redirect: z.string().optional(),
  }),
});

export const AcceptRoute = new Route({
  path: '/auth/accept-invite/$token',
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ params: { token } }) => {
    const isEmailExists = await checkIsEmailExistsByInviteToken(token);

    if (isEmailExists) {
      const organizationIdentifier = await acceptOrganizationInvite({
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

export const ResetPasswordRoute = new Route({
  path: '/auth/reset-password/$token',
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = new Route({
  path: '/auth/verify-email',
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/sign-out',
  component: SignOut,
});

const AboutRoute = new Route({
  path: '/about',
  getParentRoute: () => rootRoute,
  component: () => <About />,
});

const ContactRoute = new Route({
  path: '/contact',
  getParentRoute: () => rootRoute,
  component: () => <Contact />,
});

const TermsRoute = new Route({
  path: '/terms',
  getParentRoute: () => rootRoute,
  component: () => <Terms />,
});

const PrivacyRoute = new Route({
  path: '/privacy',
  getParentRoute: () => rootRoute,
  component: () => <Privacy />,
});

const AccessibilityRoute = new Route({
  path: '/accessibility',
  getParentRoute: () => rootRoute,
  component: () => <Accessibility />,
});

const ErrorPageRoute = new Route({
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

const IndexRoute = new Route({
  id: 'layout',
  getParentRoute: () => rootRoute,
  beforeLoad: () => {
    const storedUser = useUserStore.getState().user;

    // If no user, redirect to /about
    if (!storedUser) throw redirect({ to: '/about' });
  },
  component: () => <App />,
});

const HomeRoute = new Route({
  path: '/',
  getParentRoute: () => IndexRoute,
  component: () => <Home />,
});

const SystemPanelRoute = new Route({
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

export const UsersTableRoute = new Route({
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

export const OrganizationsTableRoute = new Route({
  path: '/organizations',
  getParentRoute: () => SystemPanelRoute,
  component: () => <OrganizationsTable />,
  validateSearch: organizationsSearchSchema,
});

const UserProfileRoute = new Route({
  path: '/user/$userIdentifier',
  getParentRoute: () => IndexRoute,
  component: () => <UserProfile />,
});

const UserSettingsRoute = new Route({
  path: '/user/settings',
  getParentRoute: () => IndexRoute,
  component: () => <UserSettings />,
});

export const organizationQueryOptions = (organizationIdentifier: string) =>
  queryOptions({
    queryKey: ['organizations', { organizationIdentifier }],
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

const OrganizationRoute = new Route({
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

export const MembersTableRoute = new Route({
  path: '/members',
  getParentRoute: () => OrganizationRoute,
  component: () => <MembersTable />,
  validateSearch: memberSearchSchema,
});

const OrganizationSettingsRoute = new Route({
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
  AuthRoute.addChildren([SignInRoute, AcceptRoute, ResetPasswordRoute, VerifyEmailRoute]),
  SignOutRoute,
  IndexRoute.addChildren([
    HomeRoute,
    SystemPanelRoute.addChildren([UsersTableRoute, OrganizationsTableRoute]),
    UserProfileRoute,
    UserSettingsRoute,
    OrganizationRoute.addChildren([MembersTableRoute, OrganizationSettingsRoute]),
  ]),
]);
