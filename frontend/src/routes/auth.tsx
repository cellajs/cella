import { createRoute, redirect } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import AcceptEntityInvite from '~/modules/auth/accept-entity-invite';
import AuthPage from '~/modules/auth/auth-layout';
import CreatePasswordForm from '~/modules/auth/create-password-form';
import EmailVerification from '~/modules/auth/email-verification';
import PasskeyOption from '~/modules/auth/passkey-option';
import { RequestPasswordForm } from '~/modules/auth/request-password-form';
import { SignOut } from '~/modules/auth/sign-out';
import AuthSteps from '~/modules/auth/steps';
import { TOTPOption } from '~/modules/auth/totp-option';
import Unsubscribed from '~/modules/auth/unsubscribed';
import { meQueryOptions } from '~/modules/me/query';
import { queryClient } from '~/query/query-client';
import { PublicRoute } from '~/routes/base';
import { useUserStore } from '~/store/user';
import appTitle from '~/utils/app-title';

export const AuthLayoutRoute = createRoute({
  id: 'auth-layout',
  staticData: { isAuth: false },
  getParentRoute: () => PublicRoute,
  component: () => <AuthPage />,
});

export const AuthenticateRoute = createRoute({
  path: '/auth/authenticate',
  validateSearch: z.object({
    redirect: z.string().optional(),
    token: z.string().optional(),
    fromRoot: z.boolean().optional(),
  }),
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
  component: () => <AuthSteps />,
});

export const Confirn2FARoute = createRoute({
  path: '/auth/2fa-confirm',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('2FA confirm') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => {
    const { t } = useTranslation();
    return (
      <>
        <h2 className="font-semibold leading-none min-h-6">{t('common:2fa.title')}</h2>

        {/* Option 1: Passkey */}
        <PasskeyOption type="two_factor" />

        <div className="relative flex justify-center text-xs uppercase">
          <span className="text-muted-foreground px-2">{t('common:or')}</span>
        </div>

        {/* Option 2: TOTP */}
        <TOTPOption />
      </>
    );
  },
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
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Email verification') }] }),
  getParentRoute: () => AuthLayoutRoute,
  component: () => <EmailVerification />,
});

export const AcceptEntityInviteRoute = createRoute({
  path: '/invitation/$token',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Join') }] }),
  beforeLoad: async ({ params }) => {
    try {
      const queryOptions = meQueryOptions();
      const options = { ...queryOptions, revalidateIfStale: true };
      await queryClient.ensureQueryData(options);
    } catch {
      console.info('Not authenticated (silent check) -> redirect to sign in');
      throw redirect({ to: '/auth/authenticate', search: { token: params.token } });
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
