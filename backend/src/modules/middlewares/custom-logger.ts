import { appSignal } from '../../lib/appsignal';

type Severity = 'trace' | 'debug' | 'info' | 'log' | 'warn' | 'error';

const apiSignalLogger = appSignal.logger('log', 'info');

export const customLogger = (message: string, data?: Parameters<(typeof apiSignalLogger)['info']>[1], severity: Severity = 'info') => {
  if (data) {
    console[severity](message, data);

    apiSignalLogger[severity](message, data);
  } else {
    console[severity](message);

    apiSignalLogger[severity](message);
  }
};
