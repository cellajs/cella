import { create } from 'zustand';
import type { AuthStep } from '~/modules/auth/types';

type MagicLinkMode = 'signin' | 'signup';

interface AuthStoreState {
  step: AuthStep;
  /** The address the step is for; empty until the visitor gives one. */
  email: string;
  /** The neutral step for an address this browser is not recognized for; `useRestrictedMode` adds the limited-IP case from health. */
  restrictedMode: boolean;
  /** Set by an in-page sign-in: the auth pages show a spinner until the route changes. */
  signedIn: boolean;
  /** The flow that sent the link, for the wording of the link-sent step. */
  magicLinkMode: MagicLinkMode;
  /** An invitation in hand, which the visitor answers with another account than the invited address. */
  inviteOtherAccount: boolean;
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
  setStep: (step, email) => set({ step, email }),
  setRestrictedMode: (restrictedMode) => set({ restrictedMode }),
  setSignedIn: (signedIn) => set({ signedIn }),
  setMagicLinkSent: (email, magicLinkMode) => set({ step: 'magicLinkSent', email, magicLinkMode }),
  setInviteOtherAccount: (inviteOtherAccount) => set({ inviteOtherAccount }),
  reset: () => set(initStore),
}));

export { useAuthStore as authStore };
