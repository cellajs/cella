import { COOKIE_SECRET, SESSION_COOKIE_NAME } from './config';
import { ORG_ID, TENANT_ID } from './seeds/ids';
import { sealSessionCookie, sessionToken } from './seeds/session-auth';
import { TOTAL_USERS } from './seeds/user-constants';

/** The organization path every bench request starts with. */
export const ORG_PATH = `/${TENANT_ID}/${ORG_ID}`;

const cookies = new Map<number, string>();

/** A `cookie` header for bench user `userIndex`, sealed from its seeded session token: no sign-in is measured. */
export function benchCookie(userIndex: number): string {
  let cookie = cookies.get(userIndex);
  if (!cookie) {
    const value = sealSessionCookie(SESSION_COOKIE_NAME, sessionToken(userIndex), COOKIE_SECRET, 24 * 60 * 60);
    cookie = `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`;
    cookies.set(userIndex, cookie);
  }
  return cookie;
}

/** The bench user a VU signs in as: VUs take the seeded users in turn. */
export function benchUser(vuIndex: number): { userIndex: number; cookie: string } {
  const userIndex = vuIndex % TOTAL_USERS;
  return { userIndex, cookie: benchCookie(userIndex) };
}
