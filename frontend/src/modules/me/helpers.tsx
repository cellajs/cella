import { getMe, getMyAuth, getMyMenu } from '~/api.gen';
import { useNavigationStore } from '~/store/navigation';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

/**
 * Retrieves the current user's information and updates the user store.
 * If the user is impersonating, it does not update the last user.
 *
 * @returns The user data object.
 */
export const getAndSetMe = async () => {
  const user = await getMe();
  const skipLastUser = useUIStore.getState().impersonating;
  useUserStore.getState().setUser(user, skipLastUser);
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
 * Retrieves the user's navigation menu and updates the navigation store.
 *
 * @returns The menu data.
 */
export const getAndSetMenu = async () => {
  const menu = await getMyMenu();
  useNavigationStore.setState({ menu });
  return menu;
};

export const generatePasskeyName = (email: string) => {
  const nouns = ['Phoenix', 'Dragon', 'Griffin', 'Unicorn', 'Wizard', 'Elf', 'Sorcerer', 'Knight', 'Titan', 'Valkyrie'];
  const adjectives = ['Mighty', 'Brave', 'Swift', 'Golden', 'Silent', 'Fiery', 'Lucky', 'Clever', 'Shadow', 'Bright'];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  return `${email} ${adjective}${noun}`;
};
