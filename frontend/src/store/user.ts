import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

import type {} from '@redux-devtools/extension';

import { immer } from 'zustand/middleware/immer';
import { client } from '~/api/api';
import { User } from '~/types';

interface UserState {
  user: User;
  getMe(): Promise<User | null>;
  signOut(): Promise<void>;
}

export const useUserStore = create<UserState>()(
  devtools(
    immer((set) => ({
      user: null as unknown as User,

      async getMe() {
        const response = await client.me.$get();
        const json = await response.json();

        if ('error' in json) {
          set({ user: null as unknown as User });

          return null;
        }

        set({ user: json.data });

        return json.data;
      },

      async signOut() {
        await client['sign-out'].$get();

        set({ user: null as unknown as User });
      },
    })),
  ),
);
