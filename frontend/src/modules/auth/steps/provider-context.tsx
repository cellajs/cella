import { createContext, useContext } from 'react';
import type { ApiError } from '~/lib/api';
import type { AuthStep, TokenData } from '../types';

interface AuthContextProps {
  step: AuthStep;
  email: string;
  authError: ApiError | null;
  tokenData?: TokenData;
  setStep: (step: AuthStep, email: string, error?: ApiError) => void;
  resetSteps: () => void;
}

export const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const useAuthStepsContext = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuthStepsContext must be used within an AuthProvider');
  return context;
};
