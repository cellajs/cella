import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { getAuthHealth, type SignInWithPasskeyData, signInWithPasskey } from '~/api.gen';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import {
  type ConditionalMediationResult,
  isConditionalMediationAvailable,
  startConditionalMediation,
} from '~/modules/auth/passkey-credentials';
import { CheckEmailStep, InviteOnlyStep, SignInStep, SignUpStep, WaitlistStep } from '~/modules/auth/steps';
import type { AuthStep } from '~/modules/auth/types';
import { useGetTokenData } from '~/modules/auth/use-get-token-data';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useAuthStore } from '~/store/auth';
import { useUserStore } from '~/store/user';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

function shouldShowDivider(step: AuthStep): boolean {
  // Get enabled authentication strategies
  const isOAuthEnabled = enabledStrategies.includes('oauth');
  const isPasswordEnabled = enabledStrategies.includes('password');
  const isPasskeyEnabled = enabledStrategies.includes('passkey');

  return (
    // Case 1: Password is enabled with either (passkey + user hasPasskey) or OAuth
    (isPasswordEnabled && (isPasskeyEnabled || isOAuthEnabled)) ||
    // Case 2: OAuth are enabled, and the current step is 'check'
    (isOAuthEnabled && step === 'checkEmail')
  );
}

export function AuthenticatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const { lastUser } = useUserStore();
  const { step, setStep, restrictedMode, setRestrictedMode, signedIn, setSignedIn } = useAuthStore();

  // Conditional mediation: passkey autofill on checkEmail and signIn steps
  const abortRef = useRef<AbortController | null>(null);
  const [conditionalMediationSupported, setConditionalMediationSupported] = useState(false);

  // Check if conditional mediation is available
  useEffect(() => {
    if (!enabledStrategies.includes('passkey')) return;
    isConditionalMediationAvailable().then(setConditionalMediationSupported);
  }, []);

  // Start conditional mediation when on checkEmail or signIn step
  useEffect(() => {
    if (!conditionalMediationSupported || (step !== 'checkEmail' && step !== 'signIn')) return;

    const controller = new AbortController();
    abortRef.current = controller;

    const handleCredential = async (data: ConditionalMediationResult) => {
      try {
        const body: NonNullable<SignInWithPasskeyData['body']> = data;
        await signInWithPasskey({ body });
        setSignedIn(true);
        navigate({ to: appConfig.defaultRedirectPath, replace: true });
      } catch {
        toaster(t('error:passkey_verification_failed'), 'error');
      }
    };

    startConditionalMediation(handleCredential, controller.signal).catch(() => {
      // Aborted or no credential selected — expected on navigation away
    });

    return () => controller.abort();
  }, [conditionalMediationSupported, step, navigate, setSignedIn]);

  const { data: tokenData, isLoading } = useGetTokenData('invitation', tokenId, !!tokenId);

  // Fetch auth health & check for rate limit (restrictedMode)
  const { data: healthData, isLoading: isHealthLoading } = useQuery({
    queryKey: ['auth', 'health'],
    queryFn: async () => getAuthHealth(),
    staleTime: 0,
    refetchOnMount: 'always',
    retry: false,
  });

  // Update restrictedMode based on health response
  useEffect(() => {
    if (healthData?.restrictedMode !== undefined) {
      setRestrictedMode(healthData.restrictedMode);
    }
  }, [healthData, setRestrictedMode]);

  // If token, proceed to sign up with token. If last user and no token, use last user as email
  // In restricted mode with no token/lastUser, go directly to signIn step
  useEffect(() => {
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
  if (isLoading || isHealthLoading || signedIn) return <Spinner className="h-10 w-10" />;

  // Render form based on current step
  return (
    <>
      {step === 'checkEmail' && !restrictedMode && <CheckEmailStep />}

      {step === 'signIn' && <SignInStep />}
      {step === 'signUp' && <SignUpStep tokenData={tokenData} />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'inviteOnly' && <InviteOnlyStep />}

      {/* Show passkey and oauth options conditionally */}
      {['checkEmail', 'signIn', 'signUp'].includes(step) && (
        <>
          {shouldShowDivider(step) && (
            <div className="relative flex justify-center text-xs uppercase">
              <span className="text-muted-foreground px-2">{t('common:or')}</span>
            </div>
          )}
          {enabledStrategies.includes('oauth') && <OAuthProviders authStep={step} />}
        </>
      )}
    </>
  );
}
