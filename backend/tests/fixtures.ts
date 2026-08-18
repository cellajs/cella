import { appConfig } from 'shared';

export const defaultHeaders = {
  'Content-Type': 'application/json',
  'x-forwarded-for': '123.123.123.123',
  Origin: appConfig.frontendUrl,
};

export const signUpUser = {
  email: 'test-user@example.com',
};
