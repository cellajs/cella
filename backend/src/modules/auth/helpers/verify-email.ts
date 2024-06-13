import { config } from 'config';
import authRoutesConfig from '../routes';
import { logEvent } from '../../../middlewares/logger/log-event';

export const sendVerificationEmail = (email: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutesConfig.sendVerificationEmail.path, {
      method: authRoutesConfig.sendVerificationEmail.method,
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
