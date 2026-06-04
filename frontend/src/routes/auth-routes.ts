import { createRoute, redirect } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { z } from 'zod';
import { AuthErrorPage } from '~/modules/auth/auth-error-page';
import { AuthLayout } from '~/modules/auth/auth-layout';
import { useAuthStore } from '~/modules/auth/auth-store';
import { AuthenticatePage } from '~/modules/auth/authenticate-page';
import { EmailVerificationPage } from '~/modules/auth/email-verification-page';
import { MfaPage } from '~/modules/auth/mfa-page';
import { SignOut } from '~/modules/auth/sign-out';
import { Unsubscribed as UnsubscribedPage } from '~/modules/auth/unsubscribed-page';
import { useUserStore } from '~/modules/user/user-store';
import { errorSearchSchema, PublicLayoutRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';

const authenticateRouteSearch = z.object({
  tokenId: z.string().optional(),
  redirect: z.string().optional(),
  fromRoot: z.boolean().optional(),
});

const authErrorRouteSearch = z.object({ tokenId: z.string().optional() }).extend(errorSearchSchema.shape);

/**
 * Layout wrapper for all authentication-related routes.
 */
export const AuthLayoutRoute = createRoute({
  id: 'authLayout',
  staticData: { isAuth: false },
  getParentRoute: () => PublicLayoutRoute,
  component: AuthLayout,
});

/**
 * Main authentication page for user sign-in and sign-up flows.
 */
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
  component: AuthenticatePage,
});

/**
 * Multi-factor authentication verification page.
 */
export const MfaRoute = createRoute({
  path: '/auth/mfa',
  validateSearch: authenticateRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authenticate') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: MfaPage,
});

/**
 * Email verification page to confirm user email addresses.
 */
export const EmailVerificationRoute = createRoute({
  path: '/auth/email-verification/$reason',
  validateSearch: z.object({ provider: z.string().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Email verification') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: EmailVerificationPage,
});

/**
 * Confirmation page shown after unsubscribing from emails.
 */
export const UnsubscribedRoute = createRoute({
  path: '/auth/unsubscribed',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Unsubscribed') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: UnsubscribedPage,
});

/**
 * Error page for authentication-related failures.
 */
export const AuthErrorRoute = createRoute({
  path: '/auth/error',
  validateSearch: authErrorRouteSearch,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Authentication error') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: AuthErrorPage,
});

/**
 * Sign out route that terminates the user session.
 */
export const SignOutRoute = createRoute({
  path: '/sign-out',
  validateSearch: z.object({ force: z.boolean().optional() }),
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Sign out') }] }),
  getParentRoute: () => PublicLayoutRoute,
  component: SignOut,
});
