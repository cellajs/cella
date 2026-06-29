import { appConfig } from 'shared';

/**
 * Default headers used in tests.
 * These headers can be used to simulate requests in tests without needing to set them up each time.
 */
export const defaultHeaders = {
  'Content-Type': 'application/json',
  'x-forwarded-for': '123.123.123.123',
  Origin: appConfig.frontendUrl,
};

/**
 * It provides a consistent user object that can be used across multiple tests.
 */
export const signUpUser = {
  email: 'test-user@example.com',
};
