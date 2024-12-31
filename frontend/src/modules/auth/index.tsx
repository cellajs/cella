import { useEffect, useLayoutEffect, useState } from 'react';
import { CheckEmailForm } from '~/modules/auth/check-email-form';
import { SignInForm } from '~/modules/auth/sign-in-form';
import { SignUpForm } from '~/modules/auth/sign-up-form';

import { Link, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '~/lib/api';
import AuthPage from '~/modules/auth/auth-page';
import OauthOptions from '~/modules/auth/oauth-options';
import { WaitlistForm } from '~/modules/auth/waitlist-form';
import { checkToken } from '~/modules/general/api';
import { buttonVariants } from '~/modules/ui/button';
import { SignInRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import { shouldShowDivider } from '~/utils';
import { cn } from '~/utils/cn';

export type Step = 'check' | 'signIn' | 'signUp' | 'inviteOnly' | 'error' | 'waitlist';

export type TokenData = Awaited<ReturnType<typeof checkToken>> & {
  token: string;
};

const SignIn = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();

  const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;
  const emailEnabled = enabledStrategies.includes('password') || enabledStrategies.includes('passkey');

  const [step, setStep] = useState<Step>('check');
  const [email, setEmail] = useState('');
  const [hasPasskey, setHasPasskey] = useState(false);
  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const { token } = useSearch({
    from: SignInRoute.id,
  });

  useLayoutEffect(() => {
    if (token) {
      checkToken(token)
        .then((data) => {
          setTokenData({
            ...data,
            token,
          });
          setEmail(data.email);
          setError(null);
        })
        .catch(setError);
    } else {
      setTokenData(null);
      setError(null);
    }
  }, [token]);

  const handleCheckEmail = (step: Step, email: string, hasPasskey: boolean) => {
    setEmail(email);
    setHasPasskey(hasPasskey);
    setStep(step);
  };

  const resetToInitialStep = () => setStep('check');

  useEffect(() => {
    if (lastUser?.email && !token) handleCheckEmail('signIn', lastUser.email, !!lastUser.passkey);
  }, [lastUser]);

  return (
    <AuthPage>
      {!error ? (
        <>
          {step === 'check' && emailEnabled && <CheckEmailForm tokenData={tokenData} setStep={handleCheckEmail} />}
          {step === 'signIn' && emailEnabled && <SignInForm tokenData={tokenData} email={email} resetToInitialStep={resetToInitialStep} />}
          {step === 'signUp' && emailEnabled && <SignUpForm tokenData={tokenData} email={email} resetToInitialStep={resetToInitialStep} />}
          {step === 'waitlist' && <WaitlistForm buttonContent={t('common:request_access')} email={email} changeEmail={resetToInitialStep} />}
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
      ) : (
        <>
          <span className="text-muted-foreground text-sm">{t(`common:error.${error.type}`)}</span>
          <Link to="/auth/sign-in" className={cn(buttonVariants({ size: 'lg' }), 'mt-8')}>
            {t('common:sign_in')}
            <ArrowRight size={16} className="ml-2" />
          </Link>
        </>
      )}
    </AuthPage>
  );
};

export default SignIn;
