import { getMe, getMyAuth, startImpersonation, stopImpersonation } from 'sdk';
import { meKeys } from '~/modules/me/query';
import { useUIStore } from '~/modules/ui/ui-store';
import { useUserStore } from '~/modules/user/user-store';
import { queryClient } from '~/query/query-client';
import { appStreamManager } from '~/query/realtime/stream-store';

/** Fetches the current user and updates the authenticated-user cache. */
export const getAndSetMe = async () => {
  const { user, isSystemAdmin } = await getMe();
  const skipLastUser = useUIStore.getState().impersonating;
  const previousUserId = useUserStore.getState().lastUser?.id;

  useUserStore.getState().setUser(user, skipLastUser);
  useUserStore.getState().setIsSystemAdmin(isSystemAdmin);

  // Per-user storage namespaces bind at boot, so a different user id needs a full reload to rebind every cache and store.
  if (!skipLastUser && previousUserId && previousUserId !== user.id) window.location.reload();

  return user;
};

export const getAndSetMeAuthData = async () => {
  const authInfo = await getMyAuth();
  return authInfo;
};

/** Drops me and membership caches and reconnects SSE so the new identity's role and memberships apply. */
const refreshIdentityCaches = async () => {
  queryClient.removeQueries({ queryKey: meKeys.all });
  queryClient.removeQueries({ queryKey: meKeys.memberships });
  await getAndSetMe();
  appStreamManager.reconnect();
};

export const startImpersonationFlow = async (targetUserId: string) => {
  await startImpersonation({ body: { targetUserId } });
  useUIStore.getState().setImpersonating(true);
  await refreshIdentityCaches();
};

export const stopImpersonationFlow = async () => {
  await stopImpersonation();
  useUIStore.getState().setImpersonating(false);
  await refreshIdentityCaches();
};

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
