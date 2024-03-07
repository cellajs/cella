import Appsignal from '@appsignal/javascript';
import { config } from 'config';

// App monitoring is active when debug is enabled or when not in development mode
// https://docs.appsignal.com/front-end.html
const activeMonitoring = true; //config.debug || config.mode !== 'development';

export const appSignal = new Appsignal({
  key: activeMonitoring ? config.appsignalKey : undefined,
});
