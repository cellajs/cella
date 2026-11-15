import { appConfig } from 'shared';
import { useEventListener } from '~/hooks/use-event-listener';

const message = 'You have unsaved changes. Are you sure you want to leave?';

/** Warns before leaving with unsaved changes (`beforeunload`); dev mode only logs. */
export const useBeforeUnload = (isChanged: boolean) => {
  useEventListener(
    'beforeunload',
    (event) => {
      if (appConfig.mode === 'development') return console.info('Beforeunload warning is triggered but not shown in dev mode.');

      event.preventDefault();
      event.returnValue = message;
    },
    { enabled: isChanged },
  );
};
