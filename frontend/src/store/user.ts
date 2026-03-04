import i18n from 'i18next';
import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { MeAuthData, User } from '~/api.gen';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';

type LastUser = Partial<MeUser> & { hasPasskey?: boolean };

interface UserStoreState {
  user: MeUser; // Current user data
  isSystemAdmin: boolean;
  hasPasskey: boolean; // Current user's passkey
  hasTotp: MeAuthData['hasTotp']; // Current user's passkey
  enabledOAuth: MeAuthData['enabledOAuth']; // Current user's oauth options
  lastUser: LastUser | null; // Last signed-out user's data (email, name, passkey, id, slug)
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Sets current user and updates lastUser
  setIsSystemAdmin: (isSystemAdmin: boolean) => void; // Sets current user's system admin status
  setLastUser: (lastUser: LastUser) => void; // Sets last user (used for MFA)
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
        isSystemAdmin: false,
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
              hasPasskey: state.hasPasskey,
            };
          });

          i18n.changeLanguage(user.language || 'en');
        },
        setIsSystemAdmin: (isSystemAdmin) => {
          set((state) => {
            state.isSystemAdmin = isSystemAdmin;
          });
        },
        setLastUser: (lastUser) => {
          set((state) => {
            state.lastUser = {
              email: lastUser.email,
              mfaRequired: lastUser.mfaRequired,
              hasPasskey: lastUser.hasPasskey ?? state.lastUser?.hasPasskey,
            };
          });
        },
        setMeAuthData: (data) => {
          set((state) => {
            state.hasPasskey = data.hasPasskey ?? state.hasPasskey;
            state.hasTotp = data.hasTotp ?? state.hasTotp;
            state.enabledOAuth = data.enabledOAuth ?? state.enabledOAuth;

            // Keep lastUser in sync so passkey status survives sign-out
            if (data.hasPasskey !== undefined && state.lastUser) {
              state.lastUser.hasPasskey = data.hasPasskey;
            }
          });
        },
        clearUserStore: () => {
          set((state) => {
            state.user = null as unknown as MeUser;
            state.isSystemAdmin = false;
            state.lastUser = null;
            state.enabledOAuth = [];
            state.hasPasskey = false;
          });
        },
      })),
      {
        version: 8,
        name: `${appConfig.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          isSystemAdmin: state.isSystemAdmin,
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
