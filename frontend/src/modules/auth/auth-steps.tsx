import { useEffect, useState } from 'react';
import { CheckEmailForm } from '~/modules/auth/check-email-form';
import { SignInForm } from '~/modules/auth/sign-in-form';
import { SignUpForm } from '~/modules/auth/sign-up-form';

import { Link, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '~/lib/api';
import { checkToken } from '~/modules/auth/api';
import OauthOptions from '~/modules/auth/oauth-options';
import { WaitlistForm } from '~/modules/auth/waitlist-form';
import { buttonVariants } from '~/modules/ui/button';
import { AuthenticateRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import type { TokenData } from '~/types/common';
import { shouldShowDivider } from '~/utils';
import { cn } from '~/utils/cn';

export type Step = 'checkEmail' | 'signIn' | 'signUp' | 'inviteOnly' | 'waitlist';

const AuthSteps = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();

  const { token, tokenId } = useSearch({ from: AuthenticateRoute.id });

  const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
  const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

  const [step, setStep] = useState<Step>(!token && lastUser?.email ? 'signIn' : 'checkEmail');
  const [email, setEmail] = useState((!token && lastUser?.email) || '');
  const [hasPasskey] = useState(!token && !!lastUser?.passkey);

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  // If a token is present, process it to forward user to correct step
  useEffect(() => {
    if (!token || !tokenId) return;
    checkToken({ id: tokenId })
      .then((data) => {
        setTokenData(data);
        setEmail(data.email);
        setStep(data.userId ? 'signIn' : 'signUp');
      })
      .catch(setError);
  }, [token]);

  const handleSetStep = (step: Step, email: string) => {
    setEmail(email);
    setStep(step);
  };

  const resetSteps = () => setStep('checkEmail');

  if (error) {
    return (
      <>
        <span className="text-muted-foreground text-sm">{t(`error:${error.type}`)}</span>
        <Link to="/auth/authenticate" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
          {t('common:sign_in')}
          <ArrowRight size={16} className="ml-2" />
        </Link>
      </>
    );
  }

  return (
    <>
      {step === 'checkEmail' && <CheckEmailForm emailEnabled={emailEnabled} setStep={handleSetStep} />}
      {step === 'signIn' && <SignInForm emailEnabled={emailEnabled} email={email} resetSteps={resetSteps} />}
      {step === 'signUp' && <SignUpForm emailEnabled={emailEnabled} tokenData={tokenData} email={email} resetSteps={resetSteps} />}
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
          <OauthOptions email={email} actionType={step} showPasskey={hasPasskey && enabledStrategies.includes('passkey')} />
        </>
      )}
    </>
  );
};

export default AuthSteps;
