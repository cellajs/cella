import { appConfig, ContextEntityType } from 'config';
import { getMe, getMyAuth } from '~/api.gen';
import { getContextEntityTypeToListQueries } from '~/offline-config';
import { queryClient } from '~/query/query-client';
import { flattenInfiniteData } from '~/query/utils/flatten';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';
import { buildMenuFromByType } from '../navigation/menu-sheet/helpers/build-menu';
import { EntityDataWithMembership } from './types';

/**
 * Retrieves the current user's information and updates the user store.
 * If the user is impersonating, it does not update the last user.
 *
 * @returns The user data object.
 */
export const getAndSetMe = async () => {
  const { user, systemRole } = await getMe();
  const skipLastUser = useUIStore.getState().impersonating;
  useUserStore.getState().setUser(user, skipLastUser);
  useUserStore.getState().setSystemRole(systemRole);
  return user;
};

/**
 * Retrieves the current user's authentication information and updates the user store.
 *
 * @returns The data object.
 */
export const getAndSetMeAuthData = async () => {
  const authInfo = await getMyAuth();
  const authData = {
    hasPasskey: !!authInfo.passkeys.length,
    hasTotp: authInfo.hasTotp,
    enabledOAuth: authInfo.enabledOAuth,
  };
  useUserStore.getState().setMeAuthData(authData);
  return authInfo;
};

/**
 * Retrieves user menu data and stores it in react query cache.
 *
 * @returns The menu data.
 */
export async function getAndSetMenu(opts?: { detailedMenu?: boolean }) {
  const userId = useUserStore.getState().user.id;

  const byType = new Map<ContextEntityType, EntityDataWithMembership[]>();

  await Promise.all(
    appConfig.contextEntityTypes.map(async (entityType) => {
      const factory = getContextEntityTypeToListQueries()[entityType];
      if (!factory) return byType.set(entityType, []);

      const data = await queryClient.ensureInfiniteQueryData(factory({ userId }));
      byType.set(entityType, flattenInfiniteData<EntityDataWithMembership>(data));
    }),
  );

  const menu = buildMenuFromByType(byType, appConfig.menuStructure, opts);

  return menu;
}

export const generatePasskeyName = () => {
  const nouns = [
    'Phoenix',
    'Dragon',
    'Griffin',
    'Unicorn',
    'Wizard',
    'Elf',
    'Sorcerer',
    'Knight',
    'Titan',
    'Valkyrie',
    'Fenix',
    'Samurai',
    'Ninja',
    'Guardian',
    'Sentinel',
  ];
  const adjectives = [
    'Mighty',
    'Brave',
    'Swift',
    'Golden',
    'Silent',
    'Fiery',
    'Lucky',
    'Clever',
    'Shadow',
    'Bright',
    'Fierce',
    'Noble',
    'Wise',
    'Bold',
    'Gallant',
    'Valiant',
    'Radiant',
    'Stellar',
    'Luminous',
    'Ethereal',
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${adjective}${noun}`;
};
