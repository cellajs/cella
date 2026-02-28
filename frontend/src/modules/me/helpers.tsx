import { getMe, getMyAuth } from '~/api.gen';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

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
