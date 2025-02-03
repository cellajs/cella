import { useEffect, useState } from 'react';
import router from '~/lib/router';

/**
 * Custom hook to track route changes.
 *
 * @returns:
 * - `hasChanged`: boolean value indicating if the route has changed
 * - `toLocation`: new location's pathname
 */
export const useRouteChange = () => {
  const [hasChanged, setHasChanged] = useState(false);
  const [toLocation, setToLocation] = useState('');

  useEffect(() => {
    const unsubscribe = router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
      // Update state if the route has changed
      if (pathChanged) setHasChanged(true);
      // Update state with the new location's pathname
      setToLocation(toLocation.pathname);
    });

    return () => unsubscribe();
  }, []);

  return { hasChanged, toLocation }; // Return the route change status and new location
};
