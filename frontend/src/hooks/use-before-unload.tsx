import { config } from 'config';
import { useEffect } from 'react';

// This hook shows a confirmation dialog when the user tries to leave the page with unsaved changes
export const useBeforeUnload = (isChanged: boolean) => {
  useEffect(() => {
    const message = 'You have unsaved changes. Are you sure you want to leave?';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // In development mode, log a message instead of showing the dialog
      if (isChanged && config.mode === 'development') {
        return console.info('Beforeunload warning is triggered but not shown in dev mode.');
      }

      // Show the confirmation dialog if there are unsaved changes
      if (isChanged) {
        e.preventDefault();
        e.returnValue = message;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isChanged]);
};
