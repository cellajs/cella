import { useEffect, useState, useSyncExternalStore } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { recheckNow } from '~/query/offline/connectivity';

// How long a visible tab must stay offline before the alert shows (ms).
const showDelay = 2000;

const subscribeVisibility = (onChange: () => void) => {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
};
const getIsVisible = () => document.visibilityState === 'visible';

/**
 * The offline alert shows once a visible tab has been offline for `showDelay` and one more probe fails, so an outage
 * met while the tab was hidden never reaches the first frame after resume. `dismiss` hides it until the next outage or resume.
 */
export function useOfflineAlert() {
  const isOnline = useOnlineManager();
  const isVisible = useSyncExternalStore(subscribeVisibility, getIsVisible);
  const isWaiting = !isOnline && isVisible;
  const [isDue, setIsDue] = useState(false);

  // Reset during render, so no frame shows an alert from before the tab hid or the app came back online.
  if (!isWaiting && isDue) setIsDue(false);

  useEffect(() => {
    if (!isWaiting) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!(await recheckNow()) && !cancelled) setIsDue(true);
    }, showDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isWaiting]);

  return { isShown: isWaiting && isDue, dismiss: () => setIsDue(false) };
}
