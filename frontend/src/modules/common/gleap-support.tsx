import Gleap from 'gleap';
import { useEffect } from 'react';
import type { User } from 'sdk';
import { appConfig } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import '~/modules/common/gleap-style.css';
import { useUserStore } from '~/modules/user/user-store';

declare global {
  interface Window {
    Gleap?: typeof Gleap;
  }
}

window.ononline = () => {
  Gleap.initialize(appConfig.gleapToken);
  Gleap.showFeedbackButton(false);
};

window.onoffline = () => {
  Gleap.destroy();
};

// Gleap initializes with its own button hidden; openGleapSupport() opens the widget
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

export function openGleapSupport() {
  if (window.Gleap) {
    Gleap.open();
  }
}

/** Connects the application session to the Gleap support widget. */
export function GleapSupport() {
  const { user } = useUserStore();
  const isOnline = useOnlineManager();

  useEffect(() => {
    if (isOnline) {
      window.Gleap = Gleap;

      if (user && window.Gleap && !window.Gleap.isUserIdentified()) setGleapUser(user);

      const unsubscribe = useUserStore.subscribe((state) => {
        const user = state.user;

        if (user) return setGleapUser(user);

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
