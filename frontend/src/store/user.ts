import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import { config } from 'config';
import { immer } from 'zustand/middleware/immer';
import { i18n } from '~/lib/i18n';
import type { User } from '~/types';

type PartialUser = Partial<User>;

interface UserState {
  user: User;
  lastUser: PartialUser | null;
  clearLastUser: () => void;
  setUser: (user: User) => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set) => ({
        // TODO: Fix this type, can we find another way to allow null, while not having to check for null all through the code?
        user: null as unknown as User,
        lastUser: null,
        clearLastUser: () => {
          set((state) => {
            state.lastUser = null;
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
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
  ),
);
