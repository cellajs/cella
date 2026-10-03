import i18n from 'i18next';
import type { Me, User, UserMinimalBase } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';

type LastUser = Pick<MeUser, 'id' | 'email'>;

export const yjsTokenKey = (entityType: ProductEntityType, entityId: string) => `${entityType}:${entityId}`;

/** i18next emits languageChanged even for the current language, which re-renders every useTranslation consumer. */
const syncLanguage = (language?: User['language']) => {
  const lng = language || 'en';
  if (i18n.language !== lng) i18n.changeLanguage(lng);
};

interface UserStoreState {
  /** Current user. `null` while signed out; set by the authenticated route guard. */
  user: MeUser | null;
  isSystemAdmin: boolean;
  /** The system admin acting as `user` through an impersonation, as `/me` names them; `null` on the user's own session. */
  impersonator: UserMinimalBase | null;
  lastUser: LastUser | null; // Identity of the last signed-out user
  yjsTokens: Record<string, string>; // Map of "entityType:entityId" → signed Yjs token (not persisted)
  setMe: (me: Me) => void; // What `/me` answered, in one write; also updates lastUser, unless impersonated
  setLastUser: (lastUser: LastUser) => void;
  setYjsToken: (key: string, token: string | null) => void;
  updateUser: (user: User) => void; // Also adjusts lastUser, unless impersonated
  reset: () => void;
}

const initStore: Pick<UserStoreState, 'user' | 'isSystemAdmin' | 'impersonator' | 'lastUser' | 'yjsTokens'> = {
  user: null,
  isSystemAdmin: false,
  impersonator: null,
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
            user: { ...state.user, ...user },
            lastUser: state.impersonator ? state.lastUser : { id: user.id, email: user.email },
          }));

          syncLanguage(user.language);
        },
        setMe: ({ user, isSystemAdmin, impersonator }) => {
          set((state) => {
            state.user = user;
            state.isSystemAdmin = isSystemAdmin;
            state.impersonator = impersonator;
            // The browser's last user stays its admin: an impersonated user never signed in here.
            if (!impersonator) state.lastUser = { id: user.id, email: user.email };
          });

          syncLanguage(user.language);
        },
        setLastUser: (lastUser) => {
          set((state) => {
            state.lastUser = { id: lastUser.id, email: lastUser.email };
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
          impersonator: state.impersonator,
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
  'read `useUserStore((state) => state.user)` and handle null elsewhere.';

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
