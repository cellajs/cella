import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { invokeToken } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { tokensTable } from '#/modules/auth/tokens-db';
import { hashToken } from '#/utils/hash-token';
import { defaultHeaders } from '../fixtures';
import { authCookie, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { mockFetchRequest, setTestConfig } from '../test-utils';
import { clearSecurityTestData } from './helpers';

vi.mock('#/lib/mailer', () => ({ mailer: { prepareEmails: vi.fn() } }));

setTestConfig({ enabledAuthStrategies: ['magic', 'passkey'] });

const sessionCookieSet = (res: Response) => res.headers.getSetCookie().some((line) => line.includes('-session-'));

/** A magic link row for `user`, optionally already opened with a single-use token (hash at rest). */
async function magicLink(user: { id: string; email: string }, opened?: { singleUse: string }) {
  const raw = nanoid(40);
  const [row] = await db
    .insert(tokensTable)
    .values({
      secret: hashToken(raw),
      type: 'magic',
      userId: user.id,
      email: user.email,
      createdBy: user.id,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      ...(opened && { invokedAt: new Date().toISOString(), singleUseToken: hashToken(opened.singleUse) }),
    })
    .returning();
  return { raw, row };
}

/**
 * A magic link signs in whoever opens it, so it must not be replayable: an opened link stays usable only in the
 * browser that opened it, proven by its own single-use cookie, not by any cookie of the same name.
 */
describe('magic link replay', async () => {
  const call = await createAppClient();

  beforeAll(() => mockFetchRequest());
  afterEach(async () => await clearSecurityTestData());

  it("must not replay an opened magic link via another link's single-use cookie", async () => {
    const victim = await createTestUser(`magic-victim-${nanoid(6)}@security-test.com`.toLowerCase());
    const { raw } = await magicLink(victim, { singleUse: nanoid(40) });

    // The attacker's own opened link hands them a validly signed `magic` cookie with another value.
    const { error, response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', nanoid(40)) },
    });
    expect(response.status).toBe(401);
    expect((error as { type: string }).type).toBe('magic_expired');
    expect(sessionCookieSet(response)).toBe(false);
  });

  it('lets the browser that opened the link open it again (positive control)', async () => {
    const user = await createTestUser(`magic-owner-${nanoid(6)}@security-test.com`.toLowerCase());
    const singleUse = nanoid(40);
    const { raw, row } = await magicLink(user, { singleUse });

    const { response } = await call(invokeToken, {
      path: { type: 'magic', token: raw },
      headers: { ...defaultHeaders, Cookie: authCookie('magic', singleUse) },
    });
    expect(response.status).toBe(302);
    expect(sessionCookieSet(response)).toBe(true);
    expect(response.headers.get('location')?.startsWith(appConfig.frontendUrl)).toBe(true);
    const [after] = await db.select().from(tokensTable).where(eq(tokensTable.id, row.id));
    expect(after.invokedAt).not.toBeNull();
  });
});
