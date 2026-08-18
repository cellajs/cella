import i18n from 'i18next';
import type { User } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';

type LastUser = Pick<MeUser, 'id' | 'email'>;

export const yjsTokenKey = (entityType: ProductEntityType, tenantId: string) => `${entityType}:${tenantId}`;

interface UserStoreState {
  /** Current user. `null` while signed out; set by the authenticated route guard. */
  user: MeUser | null;
  isSystemAdmin: boolean;
  lastUser: LastUser | null; // Identity of the last signed-out user
  yjsTokens: Record<string, string>; // Map of "entityType:tenantId" → HMAC token (not persisted)
  setUser: (user: MeUser, skipLastUser?: boolean) => void; // Also updates lastUser
  setIsSystemAdmin: (isSystemAdmin: boolean) => void;
  setLastUser: (lastUser: LastUser) => void;
  setYjsToken: (key: string, token: string | null) => void;
  updateUser: (user: User) => void; // Also adjusts lastUser
  reset: () => void;
}

const initStore: Pick<UserStoreState, 'user' | 'isSystemAdmin' | 'lastUser' | 'yjsTokens'> = {
  user: null,
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

// Non-hook alias for reading the store outside React components
export { useUserStore as userStore };

const signedOutMessage =
  '[userStore] Read the signed-in user while signed out. Only authenticated routes may use it; ' +
  'read `useUserStore().user` and handle null elsewhere.';

/** The signed-in user. Throws while signed out, so only components under the route guard may call it. */
export const useCurrentUser = (): MeUser => {
  const user = useUserStore((state) => state.user);
  if (!user) throw new Error(signedOutMessage);
  return user;
};

/** Imperative twin of {@link useCurrentUser}, for non-React code in authenticated flows. */
export const getCurrentUser = (): MeUser => {
  const { user } = useUserStore.getState();
  if (!user) throw new Error(signedOutMessage);
  return user;
};
