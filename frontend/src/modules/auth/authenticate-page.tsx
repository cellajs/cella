import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { getAuthHealth } from '~/api.gen';
import { OAuthProviders } from '~/modules/auth/oauth-providers';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { CheckEmailStep } from '~/modules/auth/steps/check-email';
import { InviteOnlyStep } from '~/modules/auth/steps/invite-only';
import { SignInStep } from '~/modules/auth/steps/sign-in';
import { SignUpStep } from '~/modules/auth/steps/sign-up';
import { WaitlistStep } from '~/modules/auth/steps/waitlist';
import type { AuthStep } from '~/modules/auth/types';
import { useGetTokenData } from '~/modules/auth/use-get-token-data';
import { Spinner } from '~/modules/common/spinner';
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

export interface StepBaseProp {
  emailEnabled: boolean;
}

export function AuthenticatePage() {
  const { t } = useTranslation();

  const { tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const { lastUser } = useUserStore();
  const { step, email, setStep, restrictedMode, setRestrictedMode } = useAuthStore();

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

  // Loading invitation token or health check
  if (isLoading || isHealthLoading) return <Spinner className="h-10 w-10" />;

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
          {enabledStrategies.includes('passkey') &&
            lastUser?.email === email &&
            !lastUser.mfaRequired &&
            step === 'signIn' && <PasskeyStrategy email={email} type="authentication" />}
          {enabledStrategies.includes('oauth') && <OAuthProviders authStep={step} />}
        </>
      )}
    </>
  );
}
