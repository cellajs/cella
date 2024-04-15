import { config } from 'config';
import { useEffect } from 'react';

// This hook is used to show a confirmation dialog when the user tries to leave the page with unsaved changes
export const useBeforeUnload = (isChanged: boolean) => {
  useEffect(() => {
    const message = 'You have unsaved changes. Are you sure you want to leave?';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isChanged) {
        e.preventDefault();
        e.returnValue = message;
      }
    };

    if (config.mode === 'development') {
      return console.info('Beforeunload warning is triggered but not shown in dev mode.');
    }

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isChanged]);
};
