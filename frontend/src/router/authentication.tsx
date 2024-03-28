import { Outlet, createRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import AcceptInvite from '~/modules/auth/accept-invite';
import ResetPassword from '~/modules/auth/reset-password';
import SignIn from '~/modules/auth/sign-in';
import SignOut from '~/modules/auth/sign-out';
import VerifyEmail from '~/modules/auth/verify-email';
import { useUserStore } from '~/store/user';
import { getAndSetMe, rootRoute } from './routeTree';

export const AuthRoute = createRoute({
  id: 'auth-layout',
  getParentRoute: () => rootRoute,
  beforeLoad: async ({ context }) => {
    // If stored user, redirect to home
    const storedUser = useUserStore.getState().user;
    if (storedUser) throw redirect({ to: '/', replace: true });

    try {
      // Check if authenticated
      await context.queryClient.fetchQuery({ queryKey: ['me'], queryFn: getAndSetMe });
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
  beforeLoad: () => ({ getTitle: () => 'Sign In' }),
  getParentRoute: () => AuthRoute,
  component: () => <SignIn />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const AcceptRoute = createRoute({
  path: '/auth/accept-invite/$token',
  beforeLoad: () => ({ getTitle: () => 'Accept Invite' }),
  getParentRoute: () => AuthRoute,
  component: () => <AcceptInvite />,
  validateSearch: z.object({ redirect: z.string().optional() }),
});

export const ResetPasswordRoute = createRoute({
  path: '/auth/reset-password/$token',
  beforeLoad: () => ({ getTitle: () => 'Reset Password' }),
  getParentRoute: () => AuthRoute,
  component: () => <ResetPassword />,
});

export const VerifyEmailRoute = createRoute({
  path: '/auth/verify-email',
  beforeLoad: () => ({ getTitle: () => 'Verify Email' }),
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const VerifyEmailRouteWithToken = createRoute({
  path: '/auth/verify-email/$token',
  beforeLoad: () => ({ getTitle: () => 'Verify Email' }),
  getParentRoute: () => AuthRoute,
  component: () => <VerifyEmail />,
});

export const SignOutRoute = createRoute({
  getParentRoute: () => rootRoute,
  beforeLoad: () => ({ getTitle: () => 'Sign Out' }),
  path: '/sign-out',
  component: SignOut,
});
