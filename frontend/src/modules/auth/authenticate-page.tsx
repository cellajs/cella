import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { ServerOffIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthHealth } from 'sdk';
import { appConfig } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import {
  CheckEmailStep,
  InviteOnlyStep,
  MagicLinkSentStep,
  SignInStep,
  SignUpStep,
  WaitlistStep,
} from '~/modules/auth/steps';
import { useGetTokenData } from '~/modules/auth/use-get-token-data';
import { Spinner } from '~/modules/common/spinner';
import { Alert, AlertDescription, AlertTitle } from '~/modules/ui/alert';
import { useUserStore } from '~/modules/user/user-store';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

// Auth health probe timing. Warn the user the server seems slow after the "slow"
// delay, and give up (treating the backend as down) after the timeout. Otherwise
// a down backend can leave the spinner hanging on the browser's default timeout.
const HEALTH_SLOW_MS = 5000;
const HEALTH_TIMEOUT_MS = 20000;

function shouldShowDivider(): boolean {
  return enabledStrategies.includes('oauth');
}

export function AuthenticatePage() {
  const { t } = useTranslation();

  const { tokenId } = useSearch({ from: '/_public/auth/authenticate' });

  const { lastUser } = useUserStore();
  const { step, setStep, restrictedMode, setRestrictedMode, signedIn } = useAuthStore();

  const { data: tokenData, isLoading } = useGetTokenData('invitation', tokenId, !!tokenId);

  // Fetch auth health & check for rate limit (restrictedMode)
  const {
    data: healthData,
    isLoading: isHealthLoading,
    isError: isHealthError,
  } = useQuery({
    queryKey: ['auth', 'health'],
    // Bound the request: combine the query's own signal with a hard timeout so a
    // down/unreachable backend fails deterministically instead of hanging.
    queryFn: ({ signal }) =>
      getAuthHealth({ signal: AbortSignal.any([signal, AbortSignal.timeout(HEALTH_TIMEOUT_MS)]) }),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });

  // After a short delay without a response, warn the user the server seems slow.
  const [showSlowWarning, setShowSlowWarning] = useState(false);
  useEffect(() => {
    if (!isHealthLoading) {
      setShowSlowWarning(false);
      return;
    }
    const timer = setTimeout(() => setShowSlowWarning(true), HEALTH_SLOW_MS);
    return () => clearTimeout(timer);
  }, [isHealthLoading]);

  // Update restrictedMode based on health response
  useEffect(() => {
    if (healthData?.restrictedMode !== undefined) {
      setRestrictedMode(healthData.restrictedMode);
    }
  }, [healthData, setRestrictedMode]);

  // If token, proceed to sign up with token. If last user and no token, use last user as email
  // In restricted mode with no token/lastUser, go directly to signIn step
  useEffect(() => {
    // Don't override terminal steps (e.g. magicLinkSent)
    if (step === 'magicLinkSent') return;

    if (lastUser?.email && !tokenId) return setStep('signIn', lastUser.email);

    if (!tokenData?.email) {
      // In restricted mode, skip checkEmail and go directly to signIn
      if (restrictedMode && step === 'checkEmail') {
        setStep('signIn', '');
      }
      return;
    }
    setStep('signUp', tokenData.email);
  }, [tokenData, lastUser, restrictedMode, step]);

  // Loading invitation token or health check, or already signed in (prevents UI flash during route transition)
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

  // Render form based on current step
  return (
    <>
      {step === 'checkEmail' && !restrictedMode && <CheckEmailStep />}

      {step === 'signIn' && <SignInStep />}
      {step === 'signUp' && <SignUpStep tokenData={tokenData} />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'inviteOnly' && <InviteOnlyStep />}
      {step === 'magicLinkSent' && <MagicLinkSentStep />}

      {/* Show passkey and oauth options conditionally */}
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

      {/* Health probe failed (timeout or network error), surface that the backend is down */}
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
