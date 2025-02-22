import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { i18n } from '~/lib/i18n';
import type { MeUser, User, UserAuthInfo } from '~/modules/users/types';

interface UserStoreState {
  user: MeUser; // Current user data
  passkey: UserAuthInfo['passkey']; // Current user's passkey
  oauth: UserAuthInfo['oauth']; // Current user's oauth options
  lastUser: Partial<MeUser> | null; // Last signed-out user's data (email, name, passkey, id, slug)
  clearLastUser: () => void; // Resets the `lastUser` to null.
  setUser: (user: MeUser) => void; // Sets current user and updates lastUser
  setUserAuthInfo: (data: Partial<UserAuthInfo>) => void; // Sets current user auth info
  updateUser: (user: User) => void; // Updates current user and adjusts lastUser
}

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as MeUser,
        oauth: [] as UserAuthInfo['oauth'],
        passkey: false,
        lastUser: null,
        clearLastUser: () => {
          set((state) => {
            state.lastUser = null;
          });
        },
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
        setUser: (user) => {
          set((state) => {
            state.user = user;
            state.lastUser = {
              email: user.email,
              name: user.name,
              id: user.id,
              slug: user.slug,
            };
          });

          i18n.changeLanguage(user.language || 'en');
        },
        setUserAuthInfo: (data) => {
          set((state) => {
            state.passkey = data.passkey ?? state.passkey;
            state.oauth = data.oauth ?? state.oauth;
          });
        },
      })),
      {
        version: 2,
        name: `${config.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          oauth: state.oauth,
          passkey: state.passkey,
          lastUser: state.lastUser,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
