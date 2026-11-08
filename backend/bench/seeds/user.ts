import type { InsertSessionModel } from '#/modules/auth/sessions/sessions-db';
import type { InsertUserModel } from '#/modules/user/user-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import { emailId, sessionId, userEmail, userId } from './ids';

/** The seeded user row of bench user `index`. */
export function loadtestUser(index: number): InsertUserModel {
  const id = userId(index);
  const email = userEmail(index);

  return {
    ...mockUser({ email }),
    id,
    name: `Load Test User ${index}`,
    givenName: 'Load',
    familyName: `User ${index}`,
    slug: `xbench-user-${index}`,
    languageCode: 'en',
    newsletter: false,
  };
}

export function loadtestEmail(index: number) {
  return { ...mockEmail({ id: userId(index), email: userEmail(index) }), id: emailId(index) };
}

/** The token is deterministic per index, so a scenario seals the cookie without a DB query. */
export function loadtestSession(index: number, hashedToken: string, expiresAt: string): InsertSessionModel {
  return {
    id: sessionId(index),
    secret: hashedToken,
    kind: 'regular',
    userId: userId(index),
    deviceType: 'desktop',
    deviceName: null,
    deviceOs: null,
    browser: null,
    authStrategy: 'magic',
    expiresAt,
  };
}
