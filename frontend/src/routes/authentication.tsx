import { Outlet, createRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import SignIn from '~/modules/auth';
import AcceptInvite from '~/modules/auth/accept-invite';
import ResetPassword from '~/modules/auth/reset-password';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { useUserStore } from '~/store/user';
import { getAndSetMe, rootRoute } from './routeTree';
import { queryClient } from '~/lib/router';

export const AuthRoute = createRoute({
  id: 'auth-layout',
  staticData: { pageTitle: 'Home' },
  getParentRoute: () => rootRoute,
  beforeLoad: async () => {
    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (storedUser) throw redirect({ to: '/', replace: true });

    try {
      // Check if authenticated
      await queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
    } catch (error) {
      return console.error('Not authenticated');
    }

    // If authenticated, redirect to home
    console.info('Authenticated, go to home');
    throw redirect({ to: '/', replace: true });
  },
  component: () => <Outlet />,
});

export const SignInRoute = createRoute({
  path: '/auth/sign-in',
  staticData: { pageTitle: 'Sign in' },
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const AcceptRoute = createRoute({
  path: '/auth/accept-invite/$token',
  staticData: { pageTitle: 'Accept invite' },
  getParentRoute: () => AuthRoute,
  component: () => <AcceptInvite />,
  validateSearch: z.object({ redirect: z.string().optional() }),
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
