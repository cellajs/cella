import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import authRoutesConfig from '../routes';

export const sendVerificationEmail = (email: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutesConfig.sendVerificationEmail.path, {
      method: authRoutesConfig.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
  } catch (err) {
    return logEvent('Verification email could not be sent');
  }
};
