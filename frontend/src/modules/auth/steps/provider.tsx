import { useMatchRoute, useSearch } from '@tanstack/react-router';
import { type ReactNode, useEffect, useState } from 'react';
import type { ApiError } from '~/lib/api';
import type { AuthStep } from '~/modules/auth/types';
import { useCheckToken } from '~/modules/auth/use-token-check';
import { useUserStore } from '~/store/user';
import { AuthContext } from './provider-context';

// TODO refactor to store?
export const AuthStepsProvider = ({ children }: { children: ReactNode }) => {
  const matchRoute = useMatchRoute();
  const { lastUser } = useUserStore();
  const { tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const isMfaRoute = !!matchRoute({ to: '/auth/authenticate/mfa-confirmation' });

  // Initialize email and step
  const initEmail = (!tokenId && lastUser?.email) || '';
  const initStep: AuthStep = !tokenId && lastUser?.email ? 'signIn' : 'checkEmail';

  const [email, setEmail] = useState(initEmail);
  const [step, setStepState] = useState<AuthStep>(initStep);
  const [authError, setAuthError] = useState<ApiError | null>(null);

  const { data: tokenData } = useCheckToken('invitation', tokenId, !!tokenId);

  const setStep = (newStep: AuthStep, newEmail: string, error?: ApiError) => {
    setStepState(newStep);
    setEmail(newEmail);
    if (error) setAuthError(error);
  };

  const resetSteps = () => {
    setStepState('checkEmail');
    setAuthError(null);
  };

  // Handle MFA from query params
  useEffect(() => {
    if (isMfaRoute) setStepState('mfa');
  }, [isMfaRoute]);

  // If token is provided, directly set email and step based on token data
  useEffect(() => {
    if (!tokenId || !tokenData?.email) return;

    setEmail(tokenData.email);
    setStepState(tokenData.userId ? 'signIn' : 'signUp');
  }, [tokenData]);

  return <AuthContext.Provider value={{ step, email, authError, tokenData, setStep, resetSteps }}>{children}</AuthContext.Provider>;
};
