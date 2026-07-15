import type { UserModel } from '#/modules/user/user-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import { emailId, sessionId, userEmail, userId } from './ids';

/**
 * Generate a load-test user insert row by index, using backend mocks for a
 * type-safe entity. Runs in Node.js (data-setup), not in Artillery scenarios.
 */
export function loadtestUser(index: number) {
  const id = userId(index);
  const email = userEmail(index);

  return {
    ...mockUser({ email }),
    id,
    name: `Load Test User ${index}`,
    firstName: 'Load',
    lastName: `User ${index}`,
    slug: `xbench-user-${index}`,
    language: 'en',
    newsletter: false,
  };
}

/**
 * Generate a verified email row for a load-test user.
 */
export function loadtestEmail(index: number) {
  return {
    ...mockEmail({ id: userId(index), email: userEmail(index) } as UserModel),
    id: emailId(index),
  };
}

/**
 * Token is deterministic per index so the Artillery processor can reconstruct the
 * cookie without querying the DB.
 */
export function loadtestSession(index: number, hashedToken: string, expiresAt: string) {
  return {
    id: sessionId(index),
    secret: hashedToken,
    type: 'regular',
    userId: userId(index),
    deviceType: 'desktop',
    deviceName: null,
    deviceOs: null,
    browser: null,
    authStrategy: 'magic',
    expiresAt,
  };
}
