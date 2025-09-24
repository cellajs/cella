import { createRoute, redirect } from '@tanstack/react-router';
import { appConfig } from 'config';
import { z } from 'zod';
import AcceptEntityInvite from '~/modules/auth/accept-entity-invite';
import CreatePasswordForm from '~/modules/auth/create-password-form';
import EmailVerification from '~/modules/auth/email-verification';
import AuthPage from '~/modules/auth/layout';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { SignOut } from '~/modules/auth/sign-out';
import AuthSteps from '~/modules/auth/steps';
import { MfaStep } from '~/modules/auth/steps/mfa';
import { AuthStepsProvider } from '~/modules/auth/steps/provider';
import Unsubscribed from '~/modules/auth/unsubscribed';
import { meQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { PublicRoute } from '~/routes/base-routes';
import { useUserStore } from '~/store/user';
import appTitle from '~/utils/app-title';

const authenticateRouteSearch = z.object({
  tokenId: z.string().optional(),
  token: z.string().optional(),
  redirect: z.string().optional(),
  fromRoot: z.boolean().optional(),
});

const invitationRouteSearch = authenticateRouteSearch.extend({
  tokenId: z.string(),
});

export const AuthLayoutRoute = createRoute({
  id: 'authLayout',
  staticData: { isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <AuthPage />,
});

export const AuthenticateRoute = createRoute({
  path: '/auth/authenticate',
  validateSearch: authenticateRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.fromRoot) return;

    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (!storedUser) return;
    throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
  },
  component: () => (
    <AuthStepsProvider>
      <AuthSteps />
    </AuthStepsProvider>
  ),
});

export const MfaRoute = createRoute({
  path: '/mfa-confirmation',
  validateSearch: authenticateRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  getParentRoute: () => AuthenticateRoute,
  component: () => <MfaStep />,
});

export const RequestPasswordRoute = createRoute({
  path: '/auth/request-password',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Request password') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <RequestPasswordForm />,
});

export const CreatePasswordWithTokenRoute = createRoute({
  path: '/auth/create-password/$token',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Create password') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <CreatePasswordForm />,
});

export const EmailVerificationRoute = createRoute({
  path: '/auth/email-verification/$reason',
  validateSearch: z.object({ provider: z.string().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Email verification') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <EmailVerification />,
});

export const AcceptEntityInviteRoute = createRoute({
  path: '/invitation/$token',
  validateSearch: invitationRouteSearch,
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Join') }] }),
  beforeLoad: async ({ params, search }) => {
    try {
      const queryOptions = meQueryOptions();
      const options = { ...queryOptions, revalidateIfStale: true };
      await queryClient.ensureQueryData(options);
    } catch {
      // When user is new, authentication will process the user first, then redirect back here
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/authenticate', search: { tokenId: search.tokenId, token: params.token } });
    }
  },
  getParentRoute: () => AuthLayoutRoute,
  component: () => <AcceptEntityInvite />,
});

export const UnsubscribedRoute = createRoute({
  path: '/auth/unsubscribed',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Unsubscribed') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <Unsubscribed />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  validateSearch: z.object({ force: z.boolean().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sign out') }] }),
  getParentRoute: () => PublicRoute,
  component: () => <SignOut />,
});
