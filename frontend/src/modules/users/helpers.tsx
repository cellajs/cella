import { getSelf, getUserMenu } from '~/api/me';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const getAndSetMe = async () => {
  const user = await getSelf();
  const currentSession = user.sessions.find((s) => s.isCurrent);
  // if impersonation session don't change the last user
  if (currentSession?.type === 'impersonation') useUserStore.getState().setUserWithoutSetLastUser(user);
  else useUserStore.getState().setUser(user);

  return user;
};

export const getAndSetMenu = async () => {
  const menu = await getUserMenu();
  useNavigationStore.setState({ menu });
  return menu;
};
