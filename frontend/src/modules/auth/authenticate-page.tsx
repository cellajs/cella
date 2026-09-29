import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { ServerOffIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthHealth } from 'sdk';
import { appConfig } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import {
  AcceptInvitationStep,
  CheckEmailStep,
  InviteOnlyStep,
  MagicLinkSentStep,
  SignInStep,
  SignUpStep,
  WaitlistStep,
} from '~/modules/auth/steps';
import { useGetTokenData } from '~/modules/auth/use-get-token-data';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { meQueryOptions } from '~/modules/me/query';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useUserStore } from '~/modules/user/user-store';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

// Warn after the slow delay and abort at the timeout, so a down backend never hangs on the browser default.
const HEALTH_SLOW_MS = 5000;
const HEALTH_TIMEOUT_MS = 20000;

function shouldShowDivider(): boolean {
  return enabledStrategies.includes('oauth');
}

export function AuthenticatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });

  const { lastUser } = useUserStore();
  const { step, setStep, restrictedMode, setRestrictedMode, signedIn, inviteOtherAccount } = useAuthStore();

  // Cache-only: the route guard probes the session whenever a tokenId is present.
  const { data: signedInUser } = useQuery({ ...meQueryOptions(), enabled: false });

  // A signed-in visitor gets this page's own notice for a spent token, so the global toast stays quiet for them.
  const {
    data: tokenData,
    isLoading,
    isError: isTokenError,
  } = useGetTokenData('invitation', tokenId, !!tokenId, !!signedInUser);

  const {
    data: healthData,
    isLoading: isHealthLoading,
    isError: isHealthError,
  } = useQuery({
    queryKey: ['auth', 'health'],
    // Combine the query signal with a hard timeout so an unreachable backend fails deterministically.
    queryFn: ({ signal }) =>
      getAuthHealth({ signal: AbortSignal.any([signal, AbortSignal.timeout(HEALTH_TIMEOUT_MS)]) }),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });

  const [showSlowWarning, setShowSlowWarning] = useState(false);
  useEffect(() => {
    if (!isHealthLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), HEALTH_SLOW_MS);
    return () => clearTimeout(timer);
  }, [isHealthLoading]);

  // Only ever switches the neutral step on: an address this browser is not recognized for switches it on as well.
  useEffect(() => {
    if (healthData?.restrictedMode) setRestrictedMode(true);
  }, [healthData, setRestrictedMode]);

  useEffect(() => {
    // Don't override terminal steps (e.g. magicLinkSent)
    if (step === 'magicLinkSent') return;

    if (lastUser?.email && !tokenId) return setStep('signIn', lastUser.email);

    // An invitation pins the flow to signing up on the invited address, unless the visitor chose another account.
    if (!tokenData?.email || inviteOtherAccount) {
      if (restrictedMode && step === 'checkEmail') {
        setStep('signIn', '');
      }
      return;
    }
    setStep('signUp', tokenData.email);
  }, [tokenData, lastUser, restrictedMode, step, inviteOtherAccount]);

  // Signed in, but the token is spent, expired or not a membership invitation: nothing to confirm, so leave the auth pages.
  const nothingToConfirm = !!signedInUser && !!tokenId && !isLoading && !tokenData?.inactiveMembershipId;
  useEffect(() => {
    if (!nothingToConfirm) return;
    if (isTokenError) toaster.info(t('c:invite_link_spent'));
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
  }, [nothingToConfirm]);

  if (isLoading || isHealthLoading || signedIn) {
    return (
      <>
        <Spinner className="h-10 w-10" />
        {showSlowWarning && (
          <Alert variant="warning">
            <TriangleAlertIcon />
            <AlertTitle>{t('c:server_unresponsive')}</AlertTitle>
            <AlertDescription>{t('c:server_unresponsive.text')}</AlertDescription>
          </Alert>
        )}
      </>
    );
  }

  // Signed in and holding a membership invitation: the confirm step accepts it as this account.
  if (signedInUser && tokenData?.inactiveMembershipId) {
    return <AcceptInvitationStep tokenData={tokenData} user={signedInUser} />;
  }

  return (
    <>
      {step === 'checkEmail' && !restrictedMode && <CheckEmailStep />}

      {step === 'signIn' && <SignInStep />}
      {step === 'signUp' && <SignUpStep tokenData={tokenData} />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'inviteOnly' && <InviteOnlyStep />}
      {step === 'magicLinkSent' && <MagicLinkSentStep />}

      {['checkEmail', 'signIn', 'signUp'].includes(step) && (
        <>
          {shouldShowDivider() && (
            <div className="relative flex justify-center text-xs uppercase">
              <span className="px-2 text-muted-foreground">{t('c:or')}</span>
            </div>
          )}
          {enabledStrategies.includes('oauth') && <OAuthProviders authStep={step} />}
        </>
      )}

      {isHealthError && (
        <Alert variant="destructive">
          <ServerOffIcon />
          <AlertTitle>{t('c:server_unreachable')}</AlertTitle>
          <AlertDescription>{t('c:server_unreachable.text')}</AlertDescription>
        </Alert>
      )}
    </>
  );
}
