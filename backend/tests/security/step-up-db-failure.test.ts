import { decodeBase32 } from '@oslojs/encoding';
import { nanoid } from 'nanoid';
import { stepUp } from 'sdk';
import { appConfig } from 'shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateTOTP } from '#/modules/auth/totps/helpers/totp-core';
import { createTotpUser, type ErrorResponse } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData } from './helpers';
import { insertSession, sessionRow } from './session-helpers';

/** The error the next TOTP check throws, as the database driver would; null checks the code as usual. */
const nextCheck = vi.hoisted(() => ({ failure: null as Error | null }));

vi.mock('#/modules/auth/totps/helpers/totps', async (importOriginal) => {
  const actual = await importOriginal<typeof import('#/modules/auth/totps/helpers/totps')>();
  return {
    ...actual,
    verifyTotp: (...args: Parameters<typeof actual.verifyTotp>) => {
      const { failure } = nextCheck;
      nextCheck.failure = null;
      return failure ? Promise.reject(failure) : actual.verifyTotp(...args);
    },
  };
});

/** The Base32 secret `createTotpUser` stores. */
const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';
const currentCode = () =>
  generateTOTP(decodeBase32(TOTP_SECRET), appConfig.totp.intervalInSeconds, appConfig.totp.digits);

/** Signed in longer ago than the step-up window, so only the step-up itself stamps the session. */
const STALE = { ageMs: 60 * 60 * 1000 };

/** What the pool throws when it hands out no connection in time, and a deadlock as the driver reports it. */
const failures = [
  { name: 'an exhausted pool', error: () => new Error('timeout exceeded when trying to connect'), status: 503 },
  { name: 'a deadlock', error: () => Object.assign(new Error('deadlock detected'), { code: '40P01' }), status: 409 },
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

  it.each(failures)('answers a step-up with $status on $name', async ({ error, status }) => {
    const user = await createTotpUser(`step-up-${nanoid(8)}@security-test.com`);
    const session = await insertSession(user, STALE);

    nextCheck.failure = error();
    const failed = await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers });
    expect(failed.response.status).toBe(status);
    expect((failed.error as ErrorResponse).type).toBe('server_error');
    expect((await sessionRow(session.id)).steppedUpAt).toBeNull();

    // Positive control: the same proof steps the session up once the database answers.
    const retried = await call(stepUp, { body: { totpCode: currentCode() }, headers: session.headers });
    expect(retried.response.status).toBe(204);
  });
});
