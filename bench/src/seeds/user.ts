import type { UserModel } from '#/modules/user/user-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import { emailId, sessionId, userEmail, userId } from './ids';

/** Runs in data-setup under Node.js, not in Artillery scenarios. */
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

export function loadtestEmail(index: number) {
  return {
    ...mockEmail({ id: userId(index), email: userEmail(index) } as UserModel),
    id: emailId(index),
  };
}

/** The token is deterministic per index, so the Artillery processor reconstructs the cookie without a DB query. */
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
