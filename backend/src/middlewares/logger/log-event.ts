import { appSignal } from '../../lib/appsignal';
import type { EventData, Severity } from '../../lib/errors';

export const appSignalLogger = appSignal.logger('backend', 'info', 'json');

export const logEvent = (message: string, eventData?: EventData, severity: Severity = 'info') => {
  if (eventData) {
    console[severity](message, eventData);
    appSignalLogger[severity](message, eventData);
  } else {
    console[severity](message);
    appSignalLogger[severity](message);
  }
};
