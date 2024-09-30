import { Outlet, createRoute, redirect } from '@tanstack/react-router';
import { config } from 'config';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import SignIn from '~/modules/auth';
import ResetPassword from '~/modules/auth/reset-password';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { getAndSetMe } from '~/modules/users/helpers';
import { useUserStore } from '~/store/user';
import { PublicRoute } from './general';

export const AuthRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: null, isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <Outlet />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  validateSearch: z.object({ redirect: z.string().optional(), fromRoot: z.boolean().optional(), token: z.string().optional() }),
  staticData: { pageTitle: 'Sign in', isAuth: false },
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering
    if (cause !== 'enter' || search.fromRoot) return;

    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (storedUser) throw redirect({ to: config.defaultRedirectPath, replace: true });

    try {
      await queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe, retry: 0, gcTime: 1 });
      console.info('Authenticated -> go to home');
      throw redirect({ to: config.defaultRedirectPath, replace: true });
    } catch (error) {
      return console.info('Not authenticated (silent check)');
    }
  },
  component: () => <SignIn />,
});

export const ResetPasswordRoute = createRoute({
  path: '/auth/reset-password/$token',
  staticData: { pageTitle: 'Reset password', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = createRoute({
  path: '/auth/verify-email',
  staticData: { pageTitle: 'Verify email', isAuth: false },
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
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
