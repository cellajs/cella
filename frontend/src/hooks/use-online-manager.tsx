import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Hook to reactively track network online status via TanStack Query's onlineManager.
 *
 * @returns boolean indicating if the user is online
 */
export const useOnlineManager = () => {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((isOnline) => setIsOnline(isOnline));
    return () => unsubscribe();
  }, []);

  return isOnline;
};
