import { appConfig } from 'config';
import authRoutes from '#/modules/auth/routes';
import { logEvent } from '#/utils/logger';

/**
 * Trigger the backend to send a verification email to the user.
 *
 * @param userId
 */
export const sendVerificationEmail = (userId: string) => {
  try {
    fetch(appConfig.backendAuthUrl + authRoutes.sendVerificationEmail.path, {
      method: authRoutes.sendVerificationEmail.method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    });
  } catch (err) {
    return logEvent({ msg: 'Verification email could not be sent' });
  }
};
