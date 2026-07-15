import { useEffect } from 'react';
import { appConfig } from 'shared';

/**
 * Warns the user before leaving the page when there are unsaved changes (via `beforeunload`).
 * In development mode it logs instead of showing the dialog.
 * @param isChanged - Whether there are unsaved changes.
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
