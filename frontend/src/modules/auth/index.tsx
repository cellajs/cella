import { useEffect, useLayoutEffect, useState } from 'react';
import { CheckEmailForm } from './check-email-form';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

import { useTranslation } from 'react-i18next';
import { useUserStore } from '~/store/user';
import AuthPage from './auth-page';
import OauthOptions from './oauth-options';
import { Link, useSearch } from '@tanstack/react-router';
import { SignInRoute } from '~/routes/authentication';
import { checkToken } from '~/api/general';
import { ArrowRight } from 'lucide-react';
import { cn } from '~/lib/utils';
import { buttonVariants } from '../ui/button';
import type { ApiError } from '~/api';

export type Step = 'check' | 'signIn' | 'signUp' | 'inviteOnly' | 'error';

export type TokenData = Awaited<ReturnType<typeof checkToken>> & {
  token: string;
};

const SignIn = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();
  const [step, setStep] = useState<Step>('check');
  const [email, setEmail] = useState('');
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

  useEffect(() => {
    if (lastUser?.email && !token) handleCheckEmail('signIn', lastUser.email);
  }, [lastUser]);

  const handleCheckEmail = (step: string, email: string) => {
    setEmail(email);
    setStep(step as Step);
  };

  const handleSetStep = (step: string) => {
    setStep(step as Step);
  };

  return (
    <AuthPage>
      {!error ? (
        <>
          {step === 'check' && <CheckEmailForm tokenData={tokenData} setStep={handleCheckEmail} />}
          {step === 'signIn' && <SignInForm tokenData={tokenData} email={email} setStep={handleSetStep} />}
          {step === 'signUp' && <SignUpForm tokenData={tokenData} email={email} setStep={handleSetStep} />}
          {step === 'inviteOnly' && (
            <>
              <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
              <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text')}</h2>
            </>
          )}
          {step !== 'inviteOnly' && <OauthOptions actionType={step} />}
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
