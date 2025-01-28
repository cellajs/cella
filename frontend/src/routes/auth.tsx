import { createRoute, redirect } from '@tanstack/react-router';
import { config } from 'config';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import AcceptOrgInvite from '~/modules/auth/accept-org-invite';
import AuthPage from '~/modules/auth/auth-page';
import AuthSteps from '~/modules/auth/auth-steps';
import CreatePasswordForm from '~/modules/auth/create-password-form';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import RequestVerification from '~/modules/auth/request-verification';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { meQueryOptions } from '~/modules/users/query';
import { PublicRoute } from '~/routes/general';
import { useUserStore } from '~/store/user';

export const AuthLayoutRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: null, isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <AuthPage />,
});

export const AuthenticateRoute = createRoute({
  path: '/auth/authenticate',
  validateSearch: z.object({ redirect: z.string().optional(), token: z.string().optional() }),
  staticData: { pageTitle: 'Authenticate', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.redirect) return;

    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (!storedUser) return;
    throw redirect({ to: config.defaultRedirectPath, replace: true });
  },
  component: () => <AuthSteps />,
});

export const RequestPasswordRoute = createRoute({
  path: '/auth/request-password',
  staticData: { pageTitle: 'Request password link', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <RequestPasswordForm />,
});

export const CreatePasswordWithTokenRoute = createRoute({
  path: '/auth/create-password/$token',
  staticData: { pageTitle: 'Create password', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <CreatePasswordForm />,
});

export const RequestVerificationRoute = createRoute({
  path: '/auth/request-verification',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <RequestVerification />,
});

export const VerifyEmailWithTokenRoute = createRoute({
  path: '/auth/verify-email/$token',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <VerifyEmail />,
});

export const AcceptOrgInviteRoute = createRoute({
  path: '/invitation/$token',
  staticData: { pageTitle: 'Join organization', isAuth: true },
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ params }) => {
    try {
      const queryOptions = meQueryOptions();
      await queryClient.fetchQuery(queryOptions);
    } catch {
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/authenticate', search: { token: params.token } });
    }
  },
  component: () => <AcceptOrgInvite />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  getParentRoute: () => PublicRoute,
  staticData: { pageTitle: 'Sign out', isAuth: false },
  component: SignOut,
});
