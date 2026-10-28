import Gleap from 'gleap';
import { useEffect } from 'react';
import type { User } from 'sdk';
import { appConfig } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import '~/modules/common/gleap-style.css';
import { userStore } from '~/modules/user/user-store';

declare global {
  interface Window {
    Gleap?: typeof Gleap;
  }
}

/** Starts Gleap with its own button hidden: the app's support buttons open the widget. */
function initGleap() {
  Gleap.initialize(appConfig.gleapToken);
  Gleap.showFeedbackButton(false);
}

window.ononline = initGleap;

window.onoffline = () => {
  Gleap.destroy();
};

if (navigator.onLine) initGleap();

function setGleapUser(user: User) {
  if (!window.Gleap) return;

  window.Gleap.setLanguage(user.language || 'en');

  if (window.Gleap.isUserIdentified()) {
    window.Gleap.updateContact({ email: user.email, name: user.name || user.email });
  } else {
    window.Gleap.identify(user.id, { email: user.email, name: user.name || user.email, createdAt: new Date(user.createdAt) });
  }
}

/** Connects the application session to the Gleap support widget. */
export function GleapSupport() {
  const isOnline = useOnlineManager();

  useEffect(() => {
    if (isOnline) {
      window.Gleap = Gleap;

      const { user } = userStore.getState();
      if (user && !Gleap.isUserIdentified()) setGleapUser(user);

      const unsubscribe = userStore.subscribe((state) => {
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
  }, [isOnline]);

  return null;
}
