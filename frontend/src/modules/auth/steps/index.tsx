import { Outlet } from '@tanstack/react-router';
import { appConfig } from 'config';
import { useTranslation } from 'react-i18next';
import OAuthProviders from '~/modules/auth/oauth-providers';
import PasskeyStrategy from '~/modules/auth/passkey-strategy';
import { CheckEmailStep } from '~/modules/auth/steps/check-email';
import { AuthErrorStep } from '~/modules/auth/steps/error';
import { InviteOnlyStep } from '~/modules/auth/steps/invite-only';
import { useAuthStepsContext } from '~/modules/auth/steps/provider-context';
import { SignInStep } from '~/modules/auth/steps/sign-in';
import { SignUpStep } from '~/modules/auth/steps/sign-up';
import { WaitlistStep } from '~/modules/auth/steps/waitlist';
import type { AuthStep } from '~/modules/auth/types';
import { useUserStore } from '~/store/user';

const enabledStrategies: readonly string[] = appConfig.enabledAuthStrategies;

const shouldShowDivider = (step: AuthStep): boolean => {
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
};

export interface StepBaseProp {
  emailEnabled: boolean;
}

const AuthSteps = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();

  const { step, email } = useAuthStepsContext();

  // Render form based on current step
  return (
    <>
      {step === 'checkEmail' && <CheckEmailStep />}

      {step === 'signIn' && <SignInStep />}
      {step === 'signUp' && <SignUpStep />}

      {step === 'mfa' && <Outlet />}

      {step === 'waitlist' && <WaitlistStep />}
      {step === 'inviteOnly' && <InviteOnlyStep />}
      {step === 'error' && <AuthErrorStep />}

      {/* Show passkey and oauth options conditionally */}
      {['checkEmail', 'signIn', 'signUp'].includes(step) && (
        <>
          {shouldShowDivider(step) && (
            <div className="relative flex justify-center text-xs uppercase">
              <span className="text-muted-foreground px-2">{t('common:or')}</span>
            </div>
          )}
          {enabledStrategies.includes('passkey') && lastUser?.email === email && !lastUser.mfaRequired && step === 'signIn' && (
            <PasskeyStrategy email={email} type="authentication" />
          )}
          {enabledStrategies.includes('oauth') && <OAuthProviders authStep={step} />}
        </>
      )}
    </>
  );
};

export default AuthSteps;
