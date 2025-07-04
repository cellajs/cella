import { createRoute, redirect } from '@tanstack/react-router';
import { config } from 'config';
import { z } from 'zod/v4';
import AcceptEntityInvite from '~/modules/auth/accept-entity-invite';
import AuthPage from '~/modules/auth/auth-layout';
import CreatePasswordForm from '~/modules/auth/create-password-form';
import EmailVerification from '~/modules/auth/email-verification';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { SignOut } from '~/modules/auth/sign-out';
import AuthSteps from '~/modules/auth/steps';
import Unsubscribed from '~/modules/auth/unsubscribed';
import VerifyEmail from '~/modules/auth/verify-email';
import { meQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { PublicRoute } from '~/routes/base';
import { useUserStore } from '~/store/user';

export const AuthLayoutRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: null, isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <AuthPage />,
});

export const AuthenticateRoute = createRoute({
  path: '/auth/authenticate',
  validateSearch: z.object({
    redirect: z.string().optional(),
    token: z.string().optional(),
    tokenId: z.string().optional(),
    fromRoot: z.boolean().optional(),
  }),
  staticData: { pageTitle: 'Authenticate', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.fromRoot) return;

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
  validateSearch: z.object({ tokenId: z.string() }),
  path: '/auth/create-password/$token',
  staticData: { pageTitle: 'Create password', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <CreatePasswordForm />,
});

export const EmailVerificationRoute = createRoute({
  path: '/auth/email-verification',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <EmailVerification />,
});

export const VerifyEmailWithTokenRoute = createRoute({
  validateSearch: z.object({ tokenId: z.string() }),
  path: '/auth/verify-email/$token',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <VerifyEmail />,
});

export const AcceptEntityInviteRoute = createRoute({
  validateSearch: z.object({ tokenId: z.string() }),
  path: '/invitation/$token',
  staticData: { pageTitle: 'Join organization', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ params, search }) => {
    try {
      const queryOptions = meQueryOptions();
      const options = { ...queryOptions, revalidateIfStale: true };
      await queryClient.ensureQueryData(options);
    } catch {
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/authenticate', search: { token: params.token, tokenId: search.tokenId } });
    }
  },
  component: () => <AcceptEntityInvite />,
});

export const UnsubscribedRoute = createRoute({
  path: '/auth/unsubscribed',
  staticData: { pageTitle: 'Unsubscribed', isAuth: false },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <Unsubscribed />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  validateSearch: z.object({ force: z.boolean().optional() }),
  getParentRoute: () => PublicRoute,
  staticData: { pageTitle: 'Sign out', isAuth: false },
  component: () => <SignOut />,
});
