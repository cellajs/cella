import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Custom hook to track the network online status.
 *
 * @returns
 * - `isOnline`: boolean value indicating if the user is online
 * - `setIsOnline`: function to manually set the online status
 */
export const useOnlineManager = () => {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    // Subscribe to network mode changes
    const unsubscribe = onlineManager.subscribe((isOnline) => setIsOnline(isOnline));

    return () => unsubscribe();
  }, []);

  return {
    isOnline,
    setIsOnline,
  } as const;
};
