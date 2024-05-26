import { Outlet, createRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { queryClient } from '~/lib/router';
import SignIn from '~/modules/auth';
import ResetPassword from '~/modules/auth/reset-password';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { useUserStore } from '~/store/user';
import { getAndSetMe, rootRoute } from './routeTree';

export const AuthRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: null },
  getParentRoute: () => rootRoute,
  component: () => <Outlet />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  staticData: { pageTitle: 'Sign in' },
  getParentRoute: () => AuthRoute,
  beforeLoad: async ({ cause, search }) => {
    // Only check auth if entering
    if (cause !== 'enter' || search.fromRoot) return;

    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (storedUser) throw redirect({ to: '/', replace: true });

    try {
      await queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
      console.info('Authenticated, go to home');
      throw redirect({ to: '/', replace: true });
    } catch (error) {
      return console.info('Not authenticated (silent check)');
    }
  },
  component: () => <SignIn />,
  validateSearch: z.object({ redirect: z.string().optional(), fromRoot: z.boolean().optional(), token: z.string().optional() }),
});

export const ResetPasswordRoute = createRoute({
  path: '/auth/reset-password/$token',
  staticData: { pageTitle: 'Reset password' },
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = createRoute({
  path: '/auth/verify-email',
  staticData: { pageTitle: 'Verify email' },
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const VerifyEmailRouteWithToken = createRoute({
  path: '/auth/verify-email/$token',
  staticData: { pageTitle: 'Verify email' },
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = createRoute({
  path: '/sign-out',
  getParentRoute: () => rootRoute,
  staticData: { pageTitle: 'Sign out' },
  component: SignOut,
});
