import { appConfig } from 'config';
import i18n from 'i18next';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { GetMeResponse, User } from '~/api.gen';
import { isDebugMode } from '~/env';
import type { MeAuthData, MeUser } from '~/modules/me/types';

interface UserStoreState {
  user: MeUser; // Current user data
  systemRole: GetMeResponse['systemRole'];
  hasPasskey: boolean; // Current user's passkey
  hasTotp: MeAuthData['hasTotp']; // Current user's passkey
  enabledOAuth: MeAuthData['enabledOAuth']; // Current user's oauth options
  lastUser: Partial<MeUser> | null; // Last signed-out user's data (email, name, passkey, id, slug)
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Sets current user and updates lastUser
  setSystemRole: (systemRole: GetMeResponse['systemRole']) => void; // Sets current user and updates lastUser
  setLastUser: (lastUser: Partial<MeUser>) => void; // Sets last user (used for MFA)
  setMeAuthData: (data: Partial<Pick<MeAuthData, 'hasTotp' | 'enabledOAuth'> & { hasPasskey: boolean }>) => void; // Sets current user auth info
  updateUser: (user: User) => void; // Updates current user and adjusts lastUser
  clearUserStore: () => void; // Resets the store.
}

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        // Hackish solution to avoid type issues for user being undefined. Router should prevent user ever being undefined in the app layout routes.
        user: null as unknown as MeUser,
        systemRole: null as unknown as GetMeResponse['systemRole'],
        enabledOAuth: [] as MeAuthData['enabledOAuth'],
        hasPasskey: false,
        hasTotp: false,
        lastUser: null,
        updateUser: (user) => {
          set((state) => ({
            user: {
              ...state.user,
              ...user,
            },
            lastUser: {
              ...state.lastUser,
              email: user.email,
              name: user.name,
              id: user.id,
              slug: user.slug,
            },
          }));

          i18n.changeLanguage(user.language || 'en');
        },
        setUser: (user, skipLastUser) => {
          set((state) => {
            state.user = user;
            if (skipLastUser) return;

            state.lastUser = {
              email: user.email,
              name: user.name,
              id: user.id,
              slug: user.slug,
              mfaRequired: user.mfaRequired,
            };
          });

          i18n.changeLanguage(user.language || 'en');
        },
        setSystemRole: (systemRole) => {
          set((state) => {
            state.systemRole = systemRole;
          });
        },
        setLastUser: (lastUser) => {
          set((state) => {
            state.lastUser = {
              email: lastUser.email,
              mfaRequired: lastUser.mfaRequired,
            };
          });
        },
        setMeAuthData: (data) => {
          set((state) => {
            state.hasPasskey = data.hasPasskey ?? state.hasPasskey;
            state.hasTotp = data.hasTotp ?? state.hasTotp;
            state.enabledOAuth = data.enabledOAuth ?? state.enabledOAuth;
          });
        },
        clearUserStore: () => {
          set((state) => {
            state.user = null as unknown as MeUser;
            state.systemRole = null as unknown as GetMeResponse['systemRole'];
            state.lastUser = null;
            state.enabledOAuth = [];
            state.hasPasskey = false;
          });
        },
      })),
      {
        version: 4,
        name: `${appConfig.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          systemRole: state.systemRole,
          oauth: state.enabledOAuth,
          passkey: state.hasPasskey,
          totp: state.hasTotp,
          lastUser: state.lastUser,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'user store' },
  ),
);
