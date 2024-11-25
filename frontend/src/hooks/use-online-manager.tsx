import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

export const useOnlineManager = () => {
  const [isOnline, setIsOnline] = useState(onlineManager.isOnline());

  useEffect(() => {
    // Subscribe to network mode changes
    const unsubscribe = onlineManager.subscribe((isOnline) => {
      setIsOnline(isOnline);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    isOnline,
    setIsOnline,
  } as const;
};
