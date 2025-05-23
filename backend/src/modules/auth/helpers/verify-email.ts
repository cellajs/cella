import { config } from 'config';
import { logEvent } from '#/middlewares/logger/log-event';
import authRoutes from '../routes';

/**
 * Trigger the backend to send a verification email to the user.
 *
 * @param userId
 */
export const sendVerificationEmail = (userId: string) => {
  try {
    fetch(config.backendAuthUrl + authRoutes.sendVerificationEmail.path, {
      method: authRoutes.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch (err) {
    return logEvent('Verification email could not be sent');
  }
};
