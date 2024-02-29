import Appsignal from '@appsignal/javascript';
import { config } from 'config';

// App monitoring is active when debug is enabled or when not in development mode
const activeMonitoring = config.debug || config.mode !== 'development';

export const appSignal = new Appsignal({
  key: activeMonitoring ? config.appsignalFrontendKey : undefined,
});
