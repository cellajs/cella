import i18n from 'i18next';
import type { Me, User } from 'sdk';
import { appConfig } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { MeUser } from '~/modules/me/types';
import { uiStore } from '~/modules/ui/ui-store';

type LastUser = Pick<MeUser, 'id' | 'email'>;

/** The `localStorage` key the store persists to, which every tab of the browser shares. */
export const userStorageKey = `${appConfig.slug}-user`;

/** i18next emits languageChanged even for the current language, which re-renders every useTranslation consumer. */
const mirrorLanguage = (language?: User['language']) => {
  const lng = language || appConfig.defaultLanguage;
  if (i18n.language !== lng) i18n.changeLanguage(lng);
};

/** Mirrors the stored contrast into the UI store, which applies it, so the choice survives sign-out and reaches the public pages. */
const mirrorContrast = (contrast?: User['contrast']) => {
  uiStore.getState().setContrast(contrast ?? 'system');
};

interface UserStoreState {
  /** Current user. `null` while signed out; set by the authenticated route guard. */
  user: MeUser | null;
  isSystemAdmin: boolean;
  /** The last user signed in on this browser, kept after sign-out. */
  lastUser: LastUser | null;
  /** Stores what `/me` answered in one write; also sets lastUser. */
  setMe: (me: Me) => void;
  /** Merges into the user; also sets lastUser. */
  updateUser: (user: User) => void;
  reset: () => void;
}

const initStore: Pick<UserStoreState, 'user' | 'isSystemAdmin' | 'lastUser'> = {
  user: null,
  isSystemAdmin: false,
  lastUser: null,
};

export const useUserStore = create<UserStoreState>()(
  devtools(
    persist(
      immer((set) => ({
        ...initStore,
        updateUser: (user) => {
          set((state) => ({
            user: { ...state.user, ...user },
            lastUser: { id: user.id, email: user.email },
          }));

          mirrorLanguage(user.language);
          mirrorContrast(user.contrast);
        },
        setMe: ({ user, isSystemAdmin }) => {
          set((state) => {
            state.user = user;
            state.isSystemAdmin = isSystemAdmin;
            state.lastUser = { id: user.id, email: user.email };
          });

          mirrorLanguage(user.language);
          mirrorContrast(user.contrast);
        },
        reset: () => set(initStore),
      })),
      {
        version: 1,
        name: userStorageKey,
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
