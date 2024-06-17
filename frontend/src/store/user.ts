import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { config } from 'config';
import { immer } from 'zustand/middleware/immer';
import { i18n } from '~/lib/i18n';
import type { MeUser, User } from '~/types';

type PartialUser = Partial<MeUser>;

interface UserState {
  user: MeUser;
  lastUser: PartialUser | null;
  finishOnboarding: boolean;
  clearLastUser: () => void;
  setUser: (user: MeUser) => void;
  updateUser: (user: User) => void;
  completeOnboarding: () => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as MeUser,
        finishOnboarding: false,
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
            state.lastUser = { email: user.email, name: user.name, id: user.id, slug: user.slug };
          });

          i18n.changeLanguage(user.language || 'en');
        },
        completeOnboarding: () => {
          set((state) => {
            state.finishOnboarding = true;
          });
        },
      })),
      {
        version: 2,
        name: `${config.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          lastUser: state.lastUser,
          finishOnboarding: state.finishOnboarding,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
