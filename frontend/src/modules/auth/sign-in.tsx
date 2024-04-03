import { useEffect, useState } from 'react';
import { CheckEmailForm } from './check-email-form';
import { SignInForm } from './sign-in-form';
import { SignUpForm } from './sign-up-form';

import { useUserStore } from '~/store/user';
import AuthPage from '.';
import OauthOptions from './oauth-options';
import { Button } from '../ui/button';
import { useNavigate } from '@tanstack/react-router';

type Step = 'check' | 'signIn' | 'signUp' | 'inviteOnly';

const SignIn = () => {
  const { lastUser } = useUserStore();
  const [step, setStep] = useState<Step>('check');
  const [email, setEmail] = useState('');

  const navigate = useNavigate();

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
          <h1 className="text-2xl text-center pb-2 mt-4">Hey there!</h1>
          <h2 className="text-2xl text-center pb-4 mt-4">Cella is currently invite-only. Thanks for your interest!</h2>
          <Button type="submit" className="w-full" onClick={async () => await navigate({ to: '/', replace: true })}>
            About page
          </Button>
        </>
      )}
      {step !== 'inviteOnly' && <OauthOptions actionType={step} />}
    </AuthPage>
  );
};

export default SignIn;
