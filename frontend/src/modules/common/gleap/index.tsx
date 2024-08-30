import { config } from 'config';
import Gleap from 'gleap';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';
import '~/modules/common/gleap/style.css';

declare global {
  interface Window {
    Gleap: typeof Gleap;
  }
}

Gleap.initialize(config.gleapToken);

const setGleapUser = (user: User) => {
  if (!window.Gleap) return;

  window.Gleap.setLanguage(user.language || 'en');

  if (window.Gleap.isUserIdentified()) {
    window.Gleap.updateContact({ email: user.email, name: user.name || user.email });
  } else {
    window.Gleap.identify(user.id, { email: user.email, name: user.name || user.email, createdAt: new Date(user.createdAt) });
  }
};

const GleapSupport = () => {
  window.Gleap = Gleap;
  const user = useUserStore((state) => state.user);

  // Set Gleap user on mount
  if (user && window.Gleap && !window.Gleap.isUserIdentified()) setGleapUser(user);

  // Update Gleap user on user change
  useUserStore.subscribe((state) => {
    const user: User = state.user;

    if (user) return setGleapUser(user);

    // Clear Gleap user on sign out
    window.Gleap.clearIdentity();
  });

  return <></>;
};

export default GleapSupport;
