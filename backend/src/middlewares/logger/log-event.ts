import { Logtail } from '@logtail/node';
import type { EventData, Severity } from '../../lib/errors';
import { env } from 'env';

export const logtail = new Logtail(env.LOGTAIL_TOKEN || 'test', {
  
});

export const logEvent = (message: string, eventData?: EventData, severity: Severity = 'info') => {
  if (eventData) {
    console[severity](message, eventData);
    logtail[severity](message, undefined, eventData);
  } else {
    console[severity](message);
    logtail[severity](message);
  }
};
