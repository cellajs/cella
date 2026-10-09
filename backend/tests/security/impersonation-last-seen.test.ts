import { nanoid } from 'nanoid';
import { getMe } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { updateLastSeenAt } from '#/middlewares/update-last-seen';
import { createSystemAdminUser, createTestUser } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { insertImpersonation, insertSession, type TestSession } from './session-helpers';

// The stamp is written after the response, unawaited: the calls that ask for it are what a request decides.
vi.mock('#/middlewares/update-last-seen', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/middlewares/update-last-seen')>();
  return { ...actual, updateLastSeenAt: vi.fn(actual.updateLastSeenAt) };
});

afterEach(async () => await clearSecurityTestData());

/**
 * "Last seen" tells members and admins when a person last used the app. An admin acting as the person is not the person:
 * the impersonation's requests must leave the time alone.
 */
describe("an impersonation and the user's last-seen time", async () => {
  const call = await createAppClient();

  const meAs = async (session: TestSession) => {
    const { data, response } = await call(getMe, { headers: session.headers });
    return { status: response.status, userId: (data as { user: { id: string } } | undefined)?.user.id };
  };

  it('must not mark the impersonated user as seen via the requests of an impersonation', async () => {
    const admin = await createSystemAdminUser(`seen-admin-${nanoid(8)}@security-test.com`);
    const target = await createTestUser(`seen-target-${nanoid(8)}@security-test.com`);
    const impersonation = await insertImpersonation(await insertSession(admin), target);

    expect(await meAs(impersonation)).toEqual({ status: 200, userId: target.id });
    expect(updateLastSeenAt).not.toHaveBeenCalled();

    // Positive control: the user's own session marks them as seen.
    expect(await meAs(await insertSession(target))).toEqual({ status: 200, userId: target.id });
    expect(updateLastSeenAt).toHaveBeenCalledExactlyOnceWith(target.id);
  });
});
