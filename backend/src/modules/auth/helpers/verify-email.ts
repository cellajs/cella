import { config } from 'config';
import AuthRoutes from '../routes';
import { logEvent } from '../../../middlewares/logger/log-event';

export const sendVerificationEmail = (email: string) => {
  try {
    fetch(config.backendAuthUrl + AuthRoutes.sendVerificationEmail.path, {
      method: AuthRoutes.sendVerificationEmail.method,
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
