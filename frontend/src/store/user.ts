import i18n from 'i18next';
import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { User } from '~/api.gen';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';

type LastUser = Pick<MeUser, 'email'>;

interface UserStoreState {
  user: MeUser; // Current user data
  isSystemAdmin: boolean;
  lastUser: LastUser | null; // Last signed-out user's email
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Sets current user and updates lastUser
  setIsSystemAdmin: (isSystemAdmin: boolean) => void; // Sets current user's system admin status
  setLastUser: (lastUser: LastUser) => void; // Sets last user identity
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
        lastUser: null,
        updateUser: (user) => {
          set((state) => ({
            user: {
              ...state.user,
              ...user,
            },
            lastUser: {
              email: user.email,
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
            };
          });
        },
        clearUserStore: () => {
          set((state) => {
            state.user = null as unknown as MeUser;
            state.isSystemAdmin = false;
            state.lastUser = null;
          });
        },
      })),
      {
        version: 11,
        name: `${appConfig.slug}-user`,
        partialize: (state) => ({
          user: state.user,
          isSystemAdmin: state.isSystemAdmin,
          lastUser: state.lastUser,
        }),
        storage: createJSONStorage(() => localStorage),
      },
    ),
    { enabled: isDebugMode, name: 'user store' },
  ),
);

// Non-hook alias for accessing store outside of React components / as a value (e.g. getState)
export { useUserStore as userStore };
