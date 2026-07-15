import i18n from 'i18next';
import type { User } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';

type LastUser = Pick<MeUser, 'id' | 'email'>;

/** Construct the store key for a context-scoped Yjs token. */
export const yjsTokenKey = (entityType: ProductEntityType, tenantId: string) => `${entityType}:${tenantId}`;

interface UserStoreState {
  user: MeUser; // Current user data
  isSystemAdmin: boolean;
  lastUser: LastUser | null; // Last signed-out user's email
  yjsTokens: Record<string, string>; // Map of "entityType:tenantId" → HMAC token (not persisted)
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Sets current user and updates lastUser
  setIsSystemAdmin: (isSystemAdmin: boolean) => void; // Sets current user's system admin status
  setLastUser: (lastUser: LastUser) => void; // Sets last user identity
  setYjsToken: (key: string, token: string | null) => void; // Sets Yjs auth token for a context
  updateUser: (user: User) => void; // Updates current user and adjusts lastUser
  reset: () => void; // Resets the store.
}

// Default state values. `user` is `null` at rest; the router guarantees it's set inside app routes.
const initStore: Pick<UserStoreState, 'user' | 'isSystemAdmin' | 'lastUser' | 'yjsTokens'> = {
  user: null as unknown as MeUser,
  isSystemAdmin: false,
  lastUser: null,
  yjsTokens: {},
};

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initStore,
        updateUser: (user) => {
          set((state) => ({
            user: {
              ...state.user,
              ...user,
            },
            lastUser: {
              id: user.id,
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
              id: user.id,
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
              id: lastUser.id,
              email: lastUser.email,
            };
          });
        },
        setYjsToken: (key, token) => {
          set((state) => {
            if (token) {
              state.yjsTokens[key] = token;
            } else {
              delete state.yjsTokens[key];
            }
          });
        },
        reset: () => set(initStore),
      })),
      {
        version: 1,
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
