import { appConfig } from 'shared';

/**
 * Default headers used in tests.
 * Simulates requests without rebuilding the same header set in each test.
 */
export const defaultHeaders = {
  'Content-Type': 'application/json',
  'x-forwarded-for': '123.123.123.123',
  Origin: appConfig.frontendUrl,
};

/** Consistent user object shared across tests. */
export const signUpUser = {
  email: 'test-user@example.com',
};
