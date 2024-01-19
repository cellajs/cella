import { Appsignal } from '@appsignal/nodejs';
import config from 'config';
import { env } from 'env';

// Monitoring is active when debug is enabled or when not in development mode
const activeMonitoring = config.debug || config.mode !== 'development';

export const appSignal = new Appsignal({
  active: activeMonitoring && !!env.APPSIGNAL_BACKEND_KEY,
  name: config.name,
  pushApiKey: env.APPSIGNAL_BACKEND_KEY,
});
