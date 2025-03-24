import { config } from 'config';
import Gleap from 'gleap';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import '~/modules/common/gleap/style.css';
import type { User } from '~/modules/users/types';
import { useUserStore } from '~/store/user';

declare global {
  interface Window {
    Gleap: typeof Gleap | undefined;
  }
}

window.ononline = () => {
  Gleap.initialize(config.gleapToken);
};

window.onoffline = () => {
  Gleap.destroy();
};

// Initialize Gleap if online
if (navigator.onLine) Gleap.initialize(config.gleapToken);

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
  const { isOnline } = useOnlineManager();

  useEffect(() => {
    if (isOnline) {
      window.Gleap = Gleap;

      // Set Gleap user on mount
      if (user && window.Gleap && !window.Gleap.isUserIdentified()) setGleapUser(user);

      // Update Gleap user on user change
      const unsubscribe = useUserStore.subscribe((state) => {
        const user: User = state.user;

        if (user) return setGleapUser(user);

        // Clear Gleap user on sign out
        window.Gleap?.clearIdentity();
      });

      return () => {
        unsubscribe();
        window.Gleap?.destroy();
        window.Gleap = undefined;
      };
    }

    window.Gleap?.destroy();
    window.Gleap = undefined;
  }, [isOnline, user]);

  return null;
};

export default GleapSupport;
