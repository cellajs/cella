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

// Warn after the slow delay and abort at the timeout, so a down backend never hangs on the browser default.
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

  useEffect(() => {
    if (healthData?.restrictedMode !== undefined) {
      setRestrictedMode(healthData.restrictedMode);
    }
  }, [healthData, setRestrictedMode]);

  useEffect(() => {
    // Don't override terminal steps (e.g. magicLinkSent)
    if (step === 'magicLinkSent') return;

    if (lastUser?.email && !tokenId) return setStep('signIn', lastUser.email);

    if (!tokenData?.email) {
      if (restrictedMode && step === 'checkEmail') {
        setStep('signIn', '');
      }
      return;
    }
    setStep('signUp', tokenData.email);
  }, [tokenData, lastUser, restrictedMode, step]);

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
