import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Network status sourced from TanStack Query's onlineManager. */
export const useOnlineManager = () => {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    const unsubscribe = onlineManager.subscribe((isOnline) => setIsOnline(isOnline));
    return () => unsubscribe();
  }, []);

  return isOnline;
};
