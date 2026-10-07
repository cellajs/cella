import { create } from 'zustand';
import type { AuthStep } from '~/modules/auth/types';

type State = {
  step: AuthStep;
  email: string;
  restrictedMode: boolean; // Neutral step: silent on whether the address has an account (unknown browser or limited IP)
  signedIn: boolean; // True after successful sign-in, prevents UI flash during route transition
  magicLinkMode: 'signin' | 'signup'; // Which flow triggered the magicLinkSent step, used for contextual copy
  inviteOtherAccount: boolean; // Invitation in hand, and the visitor chose to answer it with another account than the invited address
};

type Actions = {
  setStep: (step: AuthStep, email: string) => void;
  setEmail: (email: string) => void;
  setRestrictedMode: (restricted: boolean) => void;
  setSignedIn: (signedIn: boolean) => void;
  setMagicLinkMode: (mode: 'signin' | 'signup') => void;
  setInviteOtherAccount: (inviteOtherAccount: boolean) => void;
  resetSteps: () => void;
};

const initial: State = {
  step: 'checkEmail',
  email: '',
  restrictedMode: false,
  signedIn: false,
  magicLinkMode: 'signin',
  inviteOtherAccount: false,
};

export const useAuthStore = create<State & Actions>((set) => ({
  ...initial,
  setStep: (step, email) => set(() => ({ step, email })),
  setEmail: (email) => set(() => ({ email })),
  setRestrictedMode: (restrictedMode) => set(() => ({ restrictedMode })),
  setSignedIn: (signedIn) => set(() => ({ signedIn })),
  setMagicLinkMode: (magicLinkMode) => set(() => ({ magicLinkMode })),
  setInviteOtherAccount: (inviteOtherAccount) => set(() => ({ inviteOtherAccount })),
  resetSteps: () => set(() => ({ ...initial })),
}));
