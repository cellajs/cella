import { useEffect, useLayoutEffect, useState } from 'react';
import { CheckEmailForm } from '~/modules/auth/check-email-form';
import { SignInForm } from '~/modules/auth/sign-in-form';
import { SignUpForm } from '~/modules/auth/sign-up-form';

import { Link, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ApiError } from '~/api';
import { checkToken } from '~/api/general';
import AuthPage from '~/modules/auth/auth-page';
import OauthOptions from '~/modules/auth/oauth-options';
import { WaitListForm } from '~/modules/common/wait-list-form';
import { buttonVariants } from '~/modules/ui/button';
import { SignInRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/utils';

export type Step = 'check' | 'signIn' | 'signUp' | 'inviteOnly' | 'error' | 'waitList';

export type TokenData = Awaited<ReturnType<typeof checkToken>> & {
  token: string;
};

const SignIn = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();

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
        })
        .catch(setError);
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
          {step === 'check' && <CheckEmailForm tokenData={tokenData} setStep={handleCheckEmail} />}
          {step === 'signIn' && <SignInForm tokenData={tokenData} email={email} resetToInitialStep={resetToInitialStep} />}
          {step === 'signUp' && <SignUpForm tokenData={tokenData} email={email} resetToInitialStep={resetToInitialStep} />}
          {step === 'waitList' && <WaitListForm buttonContent={t('common:request_access')} email={email} changeEmail={resetToInitialStep} />}
          {step === 'inviteOnly' && (
            <>
              <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
              <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text', { appName: config.name })}</h2>
            </>
          )}
          {step !== 'inviteOnly' && step !== 'waitList' && <OauthOptions email={email} actionType={step} hasPasskey={hasPasskey} />}
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
