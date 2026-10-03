import { useEffect, useState } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';

/**
 * True while a one-time hint should show: `canShow` is met and `key` was not seen before this mount.
 * The key is marked seen as soon as the hint first shows, but the mount keeps reading its own pre-mark
 * snapshot, so the hint (and its enter/exit animations) stays alive for the whole first visit.
 */
export const useFirstTimeHint = (key: string, canShow: boolean) => {
  const [isFirstTime] = useState(() => !useUIStore.getState().hintsSeen.includes(key));
  const isShowing = isFirstTime && canShow;

  useEffect(() => {
    if (isShowing) useUIStore.getState().setHintSeen(key);
  }, [isShowing, key]);

  return isShowing;
};
