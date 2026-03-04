import { create } from 'zustand';
import { ApiError } from '~/lib/api';
import type { AuthStep } from '~/modules/auth/types';

type State = {
  step: AuthStep;
  email: string;
  error: ApiError | null;
  restrictedMode: boolean;
  signedIn: boolean; // True after successful sign-in, prevents UI flash during route transition
};

type Actions = {
  setStep: (step: AuthStep, email: string) => void;
  setEmail: (email: string) => void;
  setError: (error: ApiError) => void;
  setRestrictedMode: (restricted: boolean) => void;
  setSignedIn: (signedIn: boolean) => void;
  resetSteps: () => void;
};

const initial: State = { step: 'checkEmail', email: '', error: null, restrictedMode: false, signedIn: false };

/**
 * Simple authenticate store for managing email and step state.
 */
export const useAuthStore = create<State & Actions>((set) => ({
  ...initial,
  setStep: (step, email) => set(() => ({ step, email })),
  setEmail: (email) => set(() => ({ email })),
  setError: (error) => set(() => ({ error })),
  setRestrictedMode: (restrictedMode) => set(() => ({ restrictedMode })),
  setSignedIn: (signedIn) => set(() => ({ signedIn })),
  resetSteps: () => set(() => ({ ...initial })),
}));
