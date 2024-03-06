import { appSignal } from './appsignal';
import type { LogData } from './error-response';

export type Severity = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';

const apiSignalLogger = appSignal.logger('backend', 'info', 'json');

export const customLogger = (message: string, data?: LogData, severity: Severity = 'info') => {
  if (data) {
    console[severity](message, data);
    apiSignalLogger[severity](message, data);
  } else {
    console[severity](message);
    apiSignalLogger[severity](message);
  }
};
