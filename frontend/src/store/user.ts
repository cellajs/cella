import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { config } from 'config';
import { immer } from 'zustand/middleware/immer';
import { i18n } from '~/lib/i18n';
import type { User } from '~/types';

type PartialUser = Partial<User>;

interface UserState {
  user: User;
  lastUser: PartialUser;
  isUserPassedOnboarding: boolean;
  clearLastUser: () => void;
  setUser: (user: User) => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as User,
        lastUser: null as unknown as PartialUser,
        isUserPassedOnboarding: false,
        clearLastUser: () => {
          set((state) => {
            state.lastUser = null as unknown as User;
          });
        },
        setUser: (user) => {
          set((state) => {
            state.user = user;
            state.lastUser = { email: user.email, name: user.name, id: user.id, slug: user.slug };
          });

          i18n.changeLanguage(user.language || 'en');
        },
      })),
      {
        version: 1,
        name: `${config.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          lastUser: state.lastUser,
          isUserPassedOnboarding: state.isUserPassedOnboarding,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
