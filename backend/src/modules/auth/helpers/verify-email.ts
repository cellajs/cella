import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import authRoutesConfig from '../routes';

// TODO, how to make this more type safe?
export const sendVerificationEmail = (userId: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutesConfig.sendVerificationEmail.path, {
      method: authRoutesConfig.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch (err) {
    return logEvent('Verification email could not be sent');
  }
};
