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
  clearLastUser: () => void;
  setUser: (user: User) => void;
}

export const useUserStore = create<UserState>()(
  devtools(
    persist(
      immer((set) => ({
        user: null as unknown as User,
        lastUser: null as unknown as PartialUser,
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

          // TODO: move to Gleap component and listen to user changes?
          if (!window.Gleap) return;

          window.Gleap.setLanguage(user.language || 'en');

          if (window.Gleap.isUserIdentified()) {
            window.Gleap.updateContact({ email: user.email, name: user.name || user.email });
          } else {
            window.Gleap.identify(user.id, { email: user.email, name: user.name || user.email, createdAt: new Date(user.createdAt) });
          }
        },
      })),
      {
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
