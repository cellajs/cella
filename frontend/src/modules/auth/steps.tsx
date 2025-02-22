import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckEmailForm } from '~/modules/auth/check-email-form';
import AuthNotice from '~/modules/auth/notice';
import OauthOptions from '~/modules/auth/oauth-options';
import { SignInForm } from '~/modules/auth/sign-in-form';
import { SignUpForm } from '~/modules/auth/sign-up-form';
import type { Step } from '~/modules/auth/types';
import { WaitlistForm } from '~/modules/auth/waitlist-form';
import Spinner from '~/modules/common/spinner';
import { AuthenticateRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import { shouldShowDivider } from '~/utils';
import PasskeyOption from './passkey-option';
import { useTokenCheck } from './use-token-check';

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

const AuthSteps = () => {
  const { t } = useTranslation();
  const { lastUser, passkey } = useUserStore();

  const { token, tokenId } = useSearch({ from: AuthenticateRoute.id });

  const [step, setStep] = useState<Step>(!token && lastUser?.email ? 'signIn' : 'checkEmail');
  const [email, setEmail] = useState((!token && lastUser?.email) || '');
  const [hasPasskey, setHasPasskey] = useState(!token && !!passkey);

  // Update step and email to proceed after email is checked
  const handleSetStep = (step: Step, email: string) => {
    setEmail(email);
    setStep(step);
  };

  // Reset steps to the first action: check email
  // Even if all email authentication is disabled, we still show check email form
  const resetSteps = () => {
    setStep('checkEmail');
    setHasPasskey(false);
  };

  const { data, isLoading, error } = useTokenCheck('invitation', tokenId, !!(token && tokenId));

  useEffect(() => {
    if (data) {
      setEmail(data.email);
      setStep(data.userId ? 'signIn' : 'signUp');
    }
  }, [data]);

  if (isLoading) return <Spinner className="h-10 w-10" />;
  if (error) return <AuthNotice error={error} />;

  // Render form based on current step
  return (
    <>
      {step === 'checkEmail' && <CheckEmailForm emailEnabled={emailEnabled} setStep={handleSetStep} />}
      {step === 'signIn' && <SignInForm emailEnabled={emailEnabled} email={email} resetSteps={resetSteps} />}
      {step === 'signUp' && <SignUpForm emailEnabled={emailEnabled} tokenData={data} email={email} resetSteps={resetSteps} />}
      {step === 'waitlist' && <WaitlistForm buttonContent={t('common:request_access')} email={email} changeEmail={resetSteps} />}
      {step === 'inviteOnly' && (
        <>
          <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
          <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text', { appName: config.name })}</h2>
        </>
      )}

      {step !== 'inviteOnly' && step !== 'waitlist' && (
        <>
          {shouldShowDivider(hasPasskey, step) && (
            <div className="relative flex justify-center text-xs uppercase">
              <span className="text-muted-foreground px-2">{t('common:or')}</span>
            </div>
          )}
          {hasPasskey && enabledStrategies.includes('passkey') && <PasskeyOption email={email} actionType={step} />}
          {enabledStrategies.includes('oauth') && <OauthOptions actionType={step} />}
        </>
      )}
    </>
  );
};

export default AuthSteps;
