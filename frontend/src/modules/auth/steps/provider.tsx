import { useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { type ReactNode, useEffect, useState } from 'react';
import type { ApiError } from '~/lib/api';
import { AuthContext } from '~/modules/auth/steps/provider-context';
import type { AuthStep } from '~/modules/auth/types';
import { useGetTokenData } from '~/modules/auth/use-token-check';
import { useUserStore } from '~/store/user';

// TODO refactor to store?
export const AuthStepsProvider = ({ children }: { children: ReactNode }) => {
  const { lastUser } = useUserStore();
  const { tokenId, error, severity } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  // Initialize email and step
  const initEmail = (!tokenId && lastUser?.email) || '';
  const initStep: AuthStep = !tokenId && lastUser?.email ? 'signIn' : 'checkEmail';

  const [email, setEmail] = useState(initEmail);
  const [step, setStepState] = useState<AuthStep>(initStep);
  const [authError, setAuthError] = useState<ApiError | null>(null);

  const { data: tokenData } = useGetTokenData('invitation', tokenId, !!tokenId);

  const setStep = (newStep: AuthStep, newEmail: string, error?: ApiError) => {
    setStepState(newStep);
    setEmail(newEmail);
    if (error) setAuthError(error);
  };

  const resetSteps = () => {
    setStepState('checkEmail');
    setAuthError(null);
  };

  useEffect(() => {
    if (!error) return;

    if (error === 'sign_up_restricted') {
      setStepState(appConfig.has.waitlist ? 'waitlist' : 'inviteOnly');
    } else setStepState('error');
  }, [error, severity]);

  // If token is provided, directly set email and step based on token data
  useEffect(() => {
    if (!tokenId || !tokenData?.email) return;

    setEmail(tokenData.email);
    setStepState(tokenData.userId ? 'signIn' : 'signUp');
  }, [tokenData]);

  return <AuthContext.Provider value={{ step, email, authError, tokenData, setStep, resetSteps }}>{children}</AuthContext.Provider>;
};
