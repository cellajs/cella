import { config } from 'config';
import Gleap from 'gleap';
import { useEffect } from 'react';
import '~/modules/common/gleap/style.css';
import { useUserStore } from '~/store/user';
import type { User } from '~/types/common';

declare global {
  interface Window {
    Gleap: typeof Gleap | undefined;
  }
}

Gleap.initialize(config.gleapToken);

const setGleapUser = (user: User) => {
  if (!window.Gleap) return;

  window.Gleap.setLanguage(user.language || 'en');

  if (window.Gleap.isUserIdentified()) {
    window.Gleap.updateContact({ email: user.email, name: user.name || user.email });
  } else {
    window.Gleap.identify(user.id, {
      email: user.email,
      name: user.name || user.email,
      createdAt: new Date(user.createdAt),
    });
  }
};

const GleapSupport = () => {
  const { user } = useUserStore();

  useEffect(() => {
    window.Gleap = Gleap;

    // Set Gleap user on mount
    if (user && window.Gleap && !window.Gleap.isUserIdentified()) setGleapUser(user);

    // Update Gleap user on user change
    useUserStore.subscribe((state) => {
      const user: User = state.user;

      if (user) return setGleapUser(user);

      // Clear Gleap user on sign out
      window.Gleap?.clearIdentity();
    });

    return () => {
      window.Gleap?.destroy();
      window.Gleap = undefined;
    };
  }, []);

  return null;
};

export default GleapSupport;
