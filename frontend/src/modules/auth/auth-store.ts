import { create } from 'zustand';
import type { AuthStep } from '~/modules/auth/types';

type MagicLinkMode = 'signin' | 'signup';

interface AuthStoreState {
  step: AuthStep;
  email: string;
  restrictedMode: boolean; // Neutral step: silent on whether the address has an account (unknown browser or limited IP)
  signedIn: boolean; // True after successful sign-in, prevents UI flash during route transition
  magicLinkMode: MagicLinkMode; // Which flow triggered the magicLinkSent step, used for contextual copy
  inviteOtherAccount: boolean; // Invitation in hand, and the visitor chose to answer it with another account than the invited address
}

interface AuthStoreActions {
  setStep: (step: AuthStep, email: string) => void;
  setRestrictedMode: (restrictedMode: boolean) => void;
  setSignedIn: (signedIn: boolean) => void;
  setMagicLinkSent: (email: string, magicLinkMode: MagicLinkMode) => void;
  setInviteOtherAccount: (inviteOtherAccount: boolean) => void;
  reset: () => void;
}

const initStore: AuthStoreState = {
  step: 'checkEmail',
  email: '',
  restrictedMode: false,
  signedIn: false,
  magicLinkMode: 'signin',
  inviteOtherAccount: false,
};

export const useAuthStore = create<AuthStoreState & AuthStoreActions>((set) => ({
  ...initStore,
  setStep: (step, email) => set(() => ({ step, email })),
  setRestrictedMode: (restrictedMode) => set(() => ({ restrictedMode })),
  setSignedIn: (signedIn) => set(() => ({ signedIn })),
  setMagicLinkSent: (email, magicLinkMode) => set(() => ({ step: 'magicLinkSent', email, magicLinkMode })),
  setInviteOtherAccount: (inviteOtherAccount) => set(() => ({ inviteOtherAccount })),
  reset: () => set(() => ({ ...initStore })),
}));

export { useAuthStore as authStore };
