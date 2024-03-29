import { useEffect, useState } from 'react';
import { CheckEmailForm } from './check-email-form';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

import { useUserStore } from '~/store/user';
import AuthPage from '.';
import OauthOptions from './oauth-options';

type Step = 'check' | 'signIn' | 'signUp';

const SignIn = () => {
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

      <OauthOptions actionType={step} />
    </AuthPage>
  );
};

export default SignIn;
