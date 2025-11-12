import { createRoute, redirect } from '@tanstack/react-router';
import { appConfig } from 'config';
import i18n from 'i18next';
import { z } from 'zod';
import AuthErrorPage from '~/modules/auth/auth-error-page';
import AuthenticatePage from '~/modules/auth/authenticate-page';
import CreatePasswordPage from '~/modules/auth/create-password-page';
import EmailVerificationPage from '~/modules/auth/email-verification-page';
import AuthPage from '~/modules/auth/layout';
import MfaPage from '~/modules/auth/mfa-page';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { SignOut } from '~/modules/auth/sign-out';
import UnsubscribedPage from '~/modules/auth/unsubscribed-page';
import { errorSearchSchema, PublicLayoutRoute } from '~/routes/base-routes';
import { useAuthStore } from '~/store/auth';
import { useUserStore } from '~/store/user';
import appTitle from '~/utils/app-title';

const authenticateRouteSearch = z.object({
  tokenId: z.string().optional(),
  redirect: z.string().optional(),
  fromRoot: z.boolean().optional(),
});

const authErrorRouteSearch = z.object({ tokenId: z.string().optional() }).extend(errorSearchSchema.shape);

export const AuthLayoutRoute = createRoute({
  id: 'authLayout',
  staticData: { isAuth: false },
  getParentRoute: () => PublicLayoutRoute,
  component: () => <AuthPage />,
});

export const AuthenticateRoute = createRoute({
  path: '/auth/authenticate',
  validateSearch: authenticateRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  getParentRoute: () => AuthLayoutRoute,
  beforeLoad: async ({ cause, search }) => {
    useAuthStore.getState().resetSteps();

    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.fromRoot) return;

    // If stored user, redirect to home
    const { user: storedUser } = useUserStore.getState();
    if (!storedUser) return;
    throw redirect({ to: appConfig.defaultRedirectPath, replace: true });
  },
  component: () => <AuthenticatePage />,
});

export const MfaRoute = createRoute({
  path: '/auth/mfa',
  validateSearch: authenticateRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <MfaPage />,
});

export const RequestPasswordRoute = createRoute({
  path: '/auth/request-password',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Request password') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => (
    <>
      <h1 className="text-2xl text-center">{i18n.t('common:reset_resource', { resource: i18n.t('common:password').toLowerCase() })}</h1>
      <p className="font-light text-center space-x-1">{i18n.t('common:reset_password.text')}</p>
      <RequestPasswordForm />
    </>
  ),
});

export const CreatePasswordWithTokenRoute = createRoute({
  path: '/auth/create-password/$tokenId',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Create password') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <CreatePasswordPage />,
});

export const EmailVerificationRoute = createRoute({
  path: '/auth/email-verification/$reason',
  validateSearch: z.object({ provider: z.string().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Email verification') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <EmailVerificationPage />,
});

export const UnsubscribedRoute = createRoute({
  path: '/auth/unsubscribed',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Unsubscribed') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <UnsubscribedPage />,
});

export const AuthErrorRoute = createRoute({
  path: '/auth/error',
  validateSearch: authErrorRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authentication error') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <AuthErrorPage />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  validateSearch: z.object({ force: z.boolean().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sign out') }] }),
  getParentRoute: () => PublicLayoutRoute,
  component: () => <SignOut />,
});
