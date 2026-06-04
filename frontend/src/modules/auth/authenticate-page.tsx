import { useQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
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
import { useUserStore } from '~/modules/user/user-store';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

function shouldShowDivider(): boolean {
  return enabledStrategies.includes('oauth');
}

export function AuthenticatePage() {
  const { t } = useTranslation();

  const { tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const { lastUser } = useUserStore();
  const { step, setStep, restrictedMode, setRestrictedMode, signedIn } = useAuthStore();

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
  if (isLoading || isHealthLoading || signedIn) return <Spinner className="h-10 w-10" />;

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
    </>
  );
}
