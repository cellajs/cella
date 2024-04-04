import { useEffect, useState } from 'react';
import { CheckEmailForm } from './check-email-form';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

import { useTranslation } from 'react-i18next';
import { useUserStore } from '~/store/user';
import AuthPage from './auth-page';
import OauthOptions from './oauth-options';

type Step = 'check' | 'signIn' | 'signUp' | 'inviteOnly';

const SignIn = () => {
  const { t } = useTranslation();
  const { lastUser } = useUserStore();
  const [step, setStep] = useState<Step>('check');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (lastUser?.email) handleCheckEmail('signIn', lastUser.email);
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
      {step === 'check' && <CheckEmailForm setStep={handleCheckEmail} />}
      {step === 'signIn' && <SignInForm email={email} setStep={handleSetStep} />}
      {step === 'signUp' && <SignUpForm email={email} setStep={handleSetStep} />}
      {step === 'inviteOnly' && (
        <>
          <h1 className="text-2xl text-center pb-2 mt-4">{t('common:hi')}</h1>
          <h2 className="text-xl text-center pb-4 mt-4">{t('common:invite_only.text')}</h2>
        </>
      )}
      {step !== 'inviteOnly' && <OauthOptions actionType={step} />}
    </AuthPage>
  );
};

export default SignIn;
