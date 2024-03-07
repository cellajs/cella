import { Appsignal } from '@appsignal/nodejs';
import { config } from 'config';

// Monitoring is active when debug is enabled or when not in development mode
const activeMonitoring = config.debug || config.mode !== 'development';

export const appSignal = new Appsignal({
  active: activeMonitoring && !!config.appsignalKey,
  name: config.name,
  pushApiKey: config.appsignalKey,
});
