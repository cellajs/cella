import { appConfig } from 'config';
import i18n from 'i18next';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { MeAuthData, MeUser } from '~/modules/me/types';
import type { User } from '~/modules/users/types';

interface UserStoreState {
  user: MeUser; // Current user data
  hasPasskey: MeAuthData['hasPasskey']; // Current user's passkey
  enabledOAuth: MeAuthData['enabledOAuth']; // Current user's oauth options
  lastUser: Partial<MeUser> | null; // Last signed-out user's data (email, name, passkey, id, slug)
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Sets current user and updates lastUser
  setMeAuthData: (data: Partial<MeAuthData>) => void; // Sets current user auth info
  updateUser: (user: User) => void; // Updates current user and adjusts lastUser
  clearUserStore: () => void; // Resets the store.
}

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as MeUser,
        enabledOAuth: [] as MeAuthData['enabledOAuth'],
        hasPasskey: false,
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
            };
          });

          i18n.changeLanguage(user.language || 'en');
        },
        setMeAuthData: (data) => {
          set((state) => {
            state.hasPasskey = data.hasPasskey ?? state.hasPasskey;
            state.enabledOAuth = data.enabledOAuth ?? state.enabledOAuth;
          });
        },
        clearUserStore: () => {
          set((state) => {
            state.user = null as unknown as MeUser;
            state.lastUser = null;
            state.enabledOAuth = [];
            state.hasPasskey = false;
          });
        },
      })),
      {
        version: 2,
        name: `${appConfig.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          oauth: state.enabledOAuth,
          passkey: state.hasPasskey,
          lastUser: state.lastUser,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
