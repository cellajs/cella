import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';

import type {} from '@redux-devtools/extension';

import config from 'config';
import { immer } from 'zustand/middleware/immer';
import { client } from '~/api/api';
import { User } from '~/types';

type PartialUser = Partial<User>;

interface UserState {
  user: User;
  lastUser: PartialUser;
  clearLastUser: () => void;
  setUser: (user: User) => void;
  getMe(): Promise<User | null>;
  signOut(): Promise<void>;
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
        },
        async getMe() {
          const response = await client.me.$get();
          const json = await response.json();

          if ('error' in json) {
            set({ user: null as unknown as User });

            return null;
          }

          const user = json.data;

          set({ user: user, lastUser: { email: user.email, name: user.name, id: user.id, slug: user.slug } });

          return json.data;
        },

        async signOut() {
          await client['sign-out'].$get();

          set({ user: null as unknown as User });
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
