import { createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { listAttachments } from 'sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';
import { adminRole } from '../fixtures';
import { adminDb, createTestOrganization, type ErrorResponse, expectRefusal } from '../helpers';
import { bearerHeaders, serviceAccountWithKey } from '../oauth-helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createFactorOrgUser } from './helpers';

/**
 * A row written straight into `api_keys` carries a hash its writer computed. Stored hashes are keyed by
 * `DATA_HASH_SECRET`: the plain SHA-256 of a well-formed key authenticates no service account.
 */
describe('API key planted in the database', async () => {
  const call = await createAppClient();

  afterEach(async () => await clearSecurityTestData());

  it('must not authenticate a key whose row stores its plain SHA-256', async () => {
    const org = await createTestOrganization();
    const admin = await createFactorOrgUser(call, org.tenantId, org.id, `admin-${nanoid(8)}`, adminRole);
    const { clientId } = await serviceAccountWithKey(org, admin.sessionCookie);

    const { key, parsed } = generateApiKey('secret');
    await adminDb.insert(apiKeysTable).values({
      actorId: clientId,
      tenantId: org.tenantId,
      name: 'planted',
      prefix: parsed.prefix,
      hash: createHash('sha256').update(key, 'utf8').digest('hex'),
      last4: parsed.last4,
    });

    const answer = await call(listAttachments, { path: { tenantId: org.tenantId, organizationId: org.id }, headers: bearerHeaders(key) });
    await expectRefusal(answer, 401, 'unauthorized');
    expect((answer.error as ErrorResponse).reason).toBe('invalid_api_key');
  });
});
