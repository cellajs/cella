import { getMe, getMyAuth, startImpersonation, stopImpersonation } from 'sdk';
import { meKeys } from '~/modules/me/query';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';

/**
 * Retrieves the current user's information and updates the user store.
 * If the user is impersonating, it does not update the last user.
 *
 * @returns The user data object.
 */
export const getAndSetMe = async () => {
  const { user, isSystemAdmin } = await getMe();
  const skipLastUser = useUIStore.getState().impersonating;
  useUserStore.getState().setUser(user, skipLastUser);
  useUserStore.getState().setIsSystemAdmin(isSystemAdmin);
  return user;
};

/**
 * Retrieves the current user's authentication information.
 *
 * @returns The data object.
 */
export const getAndSetMeAuthData = async () => {
  const authInfo = await getMyAuth();
  return authInfo;
};

/**
 * Refresh me/membership caches and reconnect SSE so the active user's
 * role and memberships are picked up after switching identity.
 */
const refreshIdentityCaches = async () => {
  // Remove stale user and membership caches so fresh data is fetched for the new identity
  queryClient.removeQueries({ queryKey: meKeys.all });
  queryClient.removeQueries({ queryKey: meKeys.memberships });
  await getAndSetMe();
  // Reconnect SSE so the subscriber uses the new role and memberships
  appStreamManager.reconnect();
};

/**
 * Start impersonating the given user and refresh local identity state.
 */
export const startImpersonationFlow = async (targetUserId: string) => {
  await startImpersonation({ query: { targetUserId } });
  useUIStore.getState().setImpersonating(true);
  await refreshIdentityCaches();
};

/**
 * Stop impersonation and refresh local identity state back to the admin user.
 */
export const stopImpersonationFlow = async () => {
  await stopImpersonation();
  useUIStore.getState().setImpersonating(false);
  await refreshIdentityCaches();
};

/**
 * Generates a random passkey name.
 */
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
