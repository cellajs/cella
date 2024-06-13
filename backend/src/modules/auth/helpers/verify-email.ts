import { config } from 'config';
import { sendVerificationEmailRouteConfig } from '../routes';
import { logEvent } from '../../../middlewares/logger/log-event';

export const sendVerificationEmail = (email: string) => {
  try {
    fetch(config.backendAuthUrl + sendVerificationEmailRouteConfig.path, {
      method: sendVerificationEmailRouteConfig.method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
      }),
    });
  } catch (err) {
    return logEvent('Verification email sending failed');
  }
};
