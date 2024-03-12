import { config } from 'config';
import { sendVerificationEmailRouteConfig } from '../modules/auth/routes';

export const sendVerificationEmail = (email: string) =>
  fetch(config.backendUrl + sendVerificationEmailRouteConfig.route.path, {
    method: sendVerificationEmailRouteConfig.route.method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
    }),
  });
