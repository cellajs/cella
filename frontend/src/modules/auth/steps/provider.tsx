import { useMatchRoute, useSearch } from '@tanstack/react-router';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import type { ApiError } from '~/lib/api';
import type { AuthStep, TokenData } from '~/modules/auth/types';
import { useCheckToken } from '~/modules/auth/use-token-check';
import { AuthenticateRoute, MfaRoute } from '~/routes/auth';
import { useUserStore } from '~/store/user';

interface AuthContextProps {
  step: AuthStep;
  email: string;
  authError: ApiError | null;
  tokenData?: TokenData;
  setStep: (step: AuthStep, email: string, error?: ApiError) => void;
  resetSteps: () => void;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthStepsProvider = ({ children }: { children: ReactNode }) => {
  const matchRoute = useMatchRoute();
  const { lastUser } = useUserStore();
  const { token } = useSearch({ from: AuthenticateRoute.id });

  const isMfaRoute = !!matchRoute({ to: MfaRoute.to });

  // Initialize email and step
  const initEmail = (!token && lastUser?.email) || '';
  const initStep: AuthStep = !token && lastUser?.email ? 'signIn' : 'checkEmail';

  const [email, setEmail] = useState(initEmail);
  const [step, setStepState] = useState<AuthStep>(initStep);
  const [authError, setAuthError] = useState<ApiError | null>(null);

  const { data: tokenData } = useCheckToken('invitation', token, !!token);

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
    if (!token || !tokenData?.email) return;

    setEmail(tokenData.email);
    setStepState(tokenData.userId ? 'signIn' : 'signUp');
  }, [tokenData]);

  return <AuthContext.Provider value={{ step, email, authError, tokenData, setStep, resetSteps }}>{children}</AuthContext.Provider>;
};

export const useAuthStepsContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthStepsContext must be used within an AuthProvider');
  return context;
};
