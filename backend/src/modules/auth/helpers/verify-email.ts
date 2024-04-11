import { config } from 'config';
import { sendVerificationEmailRouteConfig } from '../routes';

export const sendVerificationEmail = (email: string) =>
  fetch(config.backendUrl + sendVerificationEmailRouteConfig.path, {
    method: sendVerificationEmailRouteConfig.method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  });
