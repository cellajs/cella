import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ArrowLeftIcon, FingerprintPatternIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, isStrategyEnabled } from 'shared';
import { useShallow } from 'zustand/react/shallow';
import { useDelayedFlag } from '~/hooks/use-delayed-flag';
import { type AuthAlternative, AuthAlternatives } from '~/modules/auth/auth-alternatives';
import { useAuthStore } from '~/modules/auth/auth-store';
import { useOAuthAlternatives } from '~/modules/auth/oauth-strategy';
import { usePasskeySignIn } from '~/modules/auth/passkey-strategy';
import { authHealthQueryOptions, tokenDataQueryOptions } from '~/modules/auth/query';
import { ServerUnavailableAlert } from '~/modules/auth/server-unavailable-alert';
import { useSsoAlternatives } from '~/modules/auth/sso-strategy';
import { AcceptInvitationStep } from '~/modules/auth/steps/accept-invitation';
import { CheckEmailStep } from '~/modules/auth/steps/check-email';
import { InvitationStep } from '~/modules/auth/steps/invitation';
import { MagicLinkSentStep } from '~/modules/auth/steps/magic-link-sent';
import { SignInStep } from '~/modules/auth/steps/sign-in';
import { WaitlistStep } from '~/modules/auth/steps/waitlist';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { meQueryOptions } from '~/modules/me/query';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

// Warn after this delay that the backend is slow to answer.
const healthSlowMs = 5000;

export function AuthenticatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });

  const lastUser = useUserStore((state) => state.lastUser);
  const { step, setStep, signedIn, inviteOtherAccount, setInviteOtherAccount } = useAuthStore(
    useShallow((state) => ({
      step: state.step,
      setStep: state.setStep,
      signedIn: state.signedIn,
      inviteOtherAccount: state.inviteOtherAccount,
      setInviteOtherAccount: state.setInviteOtherAccount,
    })),
  );

  // Cache-only: the route guard probes the session whenever a tokenId is present.
  const { data: signedInUser } = useQuery({ ...meQueryOptions(), enabled: false });

  // A signed-in visitor gets this page's own notice for a spent token, so the global toast stays quiet for them.
  const tokenQuery = tokenDataQueryOptions('invitation', tokenId);
  const {
    data: tokenData,
    isLoading: isTokenLoading,
    error: tokenError,
  } = useQuery({ ...tokenQuery, meta: { ...tokenQuery.meta, suppressGlobalErrorToast: (error) => !!signedInUser && error.status === 401 } });

  const { data: healthData, isLoading: isHealthLoading, isError: isHealthError } = useQuery(authHealthQueryOptions);

  const showSlowWarning = useDelayedFlag(isHealthLoading, healthSlowMs);

  const passkeySignIn = usePasskeySignIn('authentication');
  const sso = useSsoAlternatives(tokenData?.ssoConnectionId, healthData?.federations);
  // With sign-up closed the email step only signs in, and the other ways in say so.
  const alternativesStep = step === 'checkEmail' && !appConfig.has.selfRegistration ? 'signIn' : step;
  const oauth = useOAuthAlternatives(alternativesStep);

  useEffect(() => {
    // The link-sent and waitlist steps stay until the visitor leaves them.
    if (step === 'magicLinkSent' || step === 'waitlist') return;

    if (lastUser?.email && !tokenId) return setStep('signIn', lastUser.email);

    // An invitation pins the flow to its own step, unless the visitor chose to answer it with another account.
    if (!tokenData?.email || inviteOtherAccount) return;
    setStep('invitation', tokenData.email);
  }, [tokenData, lastUser, step, inviteOtherAccount]);

  // Signed in, but the token is spent, expired or not a membership invitation: nothing to confirm, so leave the auth pages.
  const nothingToConfirm = !!signedInUser && !!tokenId && !isTokenLoading && !tokenData?.invitationId;
  useEffect(() => {
    if (!nothingToConfirm) return;
    if (tokenError?.status === 401) toaster.info(t('c:invite_link_spent'));
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
  }, [nothingToConfirm]);

  if (isTokenLoading || isHealthLoading || signedIn) {
    return (
      <>
        <Spinner size="lg" />
        {showSlowWarning && (
          <Alert variant="warning" className="soft-border-strong border-2">
            <TriangleAlertIcon />
            <AlertTitle>{t('c:server_unresponsive')}</AlertTitle>
            <AlertDescription>{t('c:server_unresponsive.text')}</AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  // Signed in and holding a membership invitation: the confirm step accepts it as this account.
  if (signedInUser && tokenData?.invitationId) return <AcceptInvitationStep tokenData={tokenData} user={signedInUser} />;

  // The steps that sign in or up; the invitation step lays out its own ways in.
  const isSigningIn = ['checkEmail', 'signIn'].includes(step);
  const invitation = inviteOtherAccount ? tokenData?.invitation : undefined;

  // On the email step too: a synced passkey works in a browser that never signed in here.
  const passkeyWays: AuthAlternative[] =
    isSigningIn && isStrategyEnabled('passkey')
      ? [{ id: 'passkey', icon: FingerprintPatternIcon, label: t('c:passkey.sign_in'), shortLabel: t('c:passkey'), onClick: passkeySignIn }]
      : [];
  const ssoWays = sso.institution ? [sso.institution, ...sso.federations] : sso.federations;

  return (
    <>
      {step === 'invitation' && tokenData && <InvitationStep tokenData={tokenData} federations={healthData?.federations} />}

      {step === 'checkEmail' && <CheckEmailStep invitation={invitation} />}

      {step === 'signIn' && <SignInStep invitation={invitation} />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'magicLinkSent' && <MagicLinkSentStep emailEnabled={healthData?.emailEnabled} />}

      {isSigningIn && (
        <>
          <AuthAlternatives authStep={alternativesStep} items={[...passkeyWays, ...ssoWays, ...oauth]} />
          {inviteOtherAccount && (
            <Button variant="glass" className="self-center" onClick={() => setInviteOtherAccount(false)}>
              <ArrowLeftIcon />
              {t('c:invite_back')}
            </Button>
          )}
        </>
      )}

      {isHealthError && <ServerUnavailableAlert />}
    </>
  );
}
