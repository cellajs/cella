import Gleap from 'gleap';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import type { User } from '~/api.gen';
import { useOnlineManager } from '~/hooks/use-online-manager';
import '~/modules/common/gleap/style.css';
import { useUserStore } from '~/store/user';

declare global {
  interface Window {
    Gleap: typeof Gleap | undefined;
  }
}

window.ononline = () => {
  Gleap.initialize(appConfig.gleapToken);
  Gleap.showFeedbackButton(false);
};

window.onoffline = () => {
  Gleap.destroy();
};

// Initialize Gleap if online (with button hidden)
if (navigator.onLine) {
  Gleap.initialize(appConfig.gleapToken);
  Gleap.showFeedbackButton(false);
}

function setGleapUser(user: User) {
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
}

/** Open the Gleap support widget from a custom button */
export function openGleapSupport() {
  if (window.Gleap) {
    Gleap.open();
  }
}

export function GleapSupport() {
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
}
export default GleapSupport;
