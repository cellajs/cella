import { createRoute, redirect } from '@tanstack/react-router';
import { config } from 'config';
import { z } from 'zod';
import SignIn from '~/modules/auth';
import AuthPage from '~/modules/auth/auth-page';
import CreatePasswordForm from '~/modules/auth/create-password-form';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import RequestVerification from '~/modules/auth/request-verification';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { PublicRoute } from '~/routes/general';
import { useUserStore } from '~/store/user';

export const AuthRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: null, isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <AuthPage />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  validateSearch: z.object({ redirect: z.string().optional(), token: z.string().optional() }),
  staticData: { pageTitle: 'Sign in', isAuth: false },
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering to prevent loop
    if (cause !== 'enter' || search.redirect) return;

    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (!storedUser) return;
    throw redirect({ to: config.defaultRedirectPath, replace: true });
  },
  component: () => <SignIn />,
});

export const RequestPasswordRoute = createRoute({
  path: '/auth/request-password',
  staticData: { pageTitle: 'Request password link', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <RequestPasswordForm />,
});

export const CreatePasswordWithTokenRoute = createRoute({
  path: '/auth/create-password/$token',
  staticData: { pageTitle: 'Create password', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <CreatePasswordForm />,
});

export const RequestVerificationRoute = createRoute({
  path: '/auth/request-verification',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <RequestVerification />,
});

export const VerifyEmailWithTokenRoute = createRoute({
  path: '/auth/verify-email/$token',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  getParentRoute: () => PublicRoute,
  staticData: { pageTitle: 'Sign out', isAuth: false },
  component: SignOut,
});
