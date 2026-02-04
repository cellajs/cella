import { useEffect } from 'react';
import { initTabCoordinator } from '~/query/realtime/tab-coordinator';

/** Initializes multi-tab coordination. Only mounted in AppLayout. */
export function TabCoordinator() {
  useEffect(() => {
    initTabCoordinator();
  }, []);

  return null;
}
