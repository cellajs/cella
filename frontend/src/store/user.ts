import { config } from 'config';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { i18n } from '~/lib/i18n';
import type { MeUser, User } from '~/types/common';

type PartialUser = Partial<MeUser>;

interface UserState {
  user: MeUser;
  lastUser: PartialUser | null;
  clearLastUser: () => void;
  setUser: (user: MeUser) => void;
  setUserWithoutSetLastUser: (user: MeUser) => void;
  updateUser: (user: User) => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as MeUser,
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
              passkey: state.user.passkey,
            },
          }));

          i18n.changeLanguage(user.language || 'en');
        },
        // Used for impersonation to prevent an admin from being added as the last user
        setUserWithoutSetLastUser: (user) => {
          set((state) => {
            state.user = user;
          });

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
              passkey: user.passkey,
            };
          });

          i18n.changeLanguage(user.language || 'en');
        },
      })),
      {
        version: 2,
        name: `${config.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          lastUser: state.lastUser,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
