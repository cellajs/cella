import { appConfig } from 'config';
import { useEffect } from 'react';

/**
 * Custom hook to show a confirmation dialog when the user tries to leave the page with unsaved changes.
 *
 * This hook listens for the `beforeunload` event and triggers a confirmation dialog if there are unsaved changes.
 * It prevents the page from being unloaded until the user confirms, preventing data loss.
 * In development mode, a log is shown instead of the confirmation dialog.
 *
 * @param isChanged - Boolean flag indicating whether there are unsaved changes.
 */
export const useBeforeUnload = (isChanged: boolean) => {
  useEffect(() => {
    const message = 'You have unsaved changes. Are you sure you want to leave?';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // In development mode, log a message instead of showing the dialog
      if (isChanged && appConfig.mode === 'development') {
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
