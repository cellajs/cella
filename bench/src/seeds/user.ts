/**
 * Load-test user seed helper — uses backend mocks for type-safe records.
 * Runs in Node.js (data-setup), not in k6.
 */

import type { UserModel } from '#/modules/user/user-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import { emailId, sessionId, userEmail, userId } from './ids';

/**
 * Generate a load-test user insert record by index.
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
 * Generate a verified email record for a load-test user.
 */
export function loadtestEmail(index: number) {
  return {
    ...mockEmail({ id: userId(index), email: userEmail(index) } as UserModel),
    id: emailId(index),
  };
}

/**
 * Generate a session record + cookie string for a load-test user.
 * Token is deterministic per index so the Artillery processor can reconstruct
 * the cookie without querying the DB.
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
