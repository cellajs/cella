import { useEffect } from 'react';
import { appConfig } from 'shared';

/** Warns before leaving with unsaved changes (`beforeunload`); dev mode only logs. */
export const useBeforeUnload = (isChanged: boolean) => {
  useEffect(() => {
    const message = 'You have unsaved changes. Are you sure you want to leave?';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Development mode only logs to avoid a disruptive browser dialog.
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
