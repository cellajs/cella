import { create } from 'zustand';
import { ApiError } from '~/lib/api';
import type { AuthStep } from '~/modules/auth/types';

type State = {
  step: AuthStep;
  email: string;
  error: ApiError | null;
};

type Actions = {
  setStep: (step: AuthStep, email: string) => void;
  setEmail: (email: string) => void;
  setError: (error: ApiError) => void;
  resetSteps: () => void;
};

const initial: State = { step: 'checkEmail', email: '', error: null };

/**
 * Simple authenticate store for managing email and step state.
 */
export const useAuthStore = create<State & Actions>((set) => ({
  ...initial,
  setStep: (step, email) => set(() => ({ step, email })),
  setEmail: (email) => set(() => ({ email })),
  setError: (error) => set(() => ({ error })),
  resetSteps: () => set(() => ({ ...initial })),
}));
