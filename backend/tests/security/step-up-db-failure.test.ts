import { nanoid } from 'nanoid';
import { stepUp } from 'sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTotpUser, expectRefusal, sessionRow, totpCode } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { insertStaleSession } from './session-helpers';

/** The error the next TOTP check throws, as the database driver would; null checks the code as usual. */
const nextCheck = vi.hoisted(() => ({ failure: null as Error | null }));

vi.mock('#/modules/auth/totps/operations/verify-totp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/totps/operations/verify-totp')>();
  return {
    ...actual,
    verifyTotp: (...args: Parameters<typeof actual.verifyTotp>) => {
      const { failure } = nextCheck;
      nextCheck.failure = null;
      return failure ? Promise.reject(failure) : actual.verifyTotp(...args);
    },
  };
});

/** What the pool throws when it hands out no connection in time, and a deadlock as the driver reports it. */
const failures = [
  { name: 'an exhausted pool', error: () => new Error('timeout exceeded when trying to connect'), status: 503, type: 'service_unavailable' },
  { name: 'a deadlock', error: () => Object.assign(new Error('deadlock detected'), { code: '40P01' }), status: 409, type: 'write_conflict' },
];

/**
 * A proof the server could not check is not a wrong proof: when the database fails while a second factor is checked,
 * step-up answers with the failure's own status, which tells the client to retry, never `invalid_credentials`.
 */
describe('a database failure while a second factor is checked', async () => {
  const call = await createAppClient();

  afterEach(async () => {
    nextCheck.failure = null;
    await clearSecurityTestData();
  });

  it.each(failures)('answers a step-up with $status on $name', async ({ error, status, type }) => {
    const user = await createTotpUser(`step-up-${nanoid(8)}@security-test.com`);
    const session = await insertStaleSession(user);

    nextCheck.failure = error();
    const failed = await call(stepUp, { body: { totpCode: totpCode() }, headers: session.headers });
    await expectRefusal(failed, status, type);
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    // Positive control: the same proof steps the session up once the database answers.
    const retried = await call(stepUp, { body: { totpCode: totpCode() }, headers: session.headers });
    expect(retried.response.status).toBe(204);
  });
});
