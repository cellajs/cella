import { config } from 'config';
import { sendVerificationEmailRoute } from '../routes';

export const sendVerificationEmail = (email: string) =>
  fetch(config.backendUrl + sendVerificationEmailRoute.path, {
    method: sendVerificationEmailRoute.method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  });
