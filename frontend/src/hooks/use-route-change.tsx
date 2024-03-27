import { useEffect, useState } from 'react';
import router from '~/router';

export const useRouteChange = () => {
  const [hasChanged, setHasChanged] = useState(false);
  const [toLocation, setToLocation] = useState('');

  useEffect(() => {
    const checkHasChanged = router.subscribe('onBeforeLoad', ({ pathChanged, toLocation }) => {
      pathChanged && setHasChanged(true);
      setToLocation(toLocation.pathname); 
    });

    return () => {
      checkHasChanged();
    };
  }, []);

  return { hasChanged, toLocation };
};