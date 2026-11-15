import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { baseDb as db } from '#/db/db';
import { exportAccounts } from '#/modules/auth/account/operations/export-accounts';
import { insertAnonymousUser } from '#/modules/auth/core';
import { passkeysTable } from '#/modules/auth/flows/passkeys/passkeys-db';
import { createTestUser, createTotpUser, testTotpSecret } from '../helpers';
import { clearDatabase } from '../test-utils';

afterEach(async () => await clearDatabase());

/**
 * Hanko's own schema for `hanko user import` (backend/json_schema/hanko.user_import.json at v3.1.0) is the gate. Its
 * generator renders Go's `uuid.UUID` as 16 bytes, while the importer reads the text form. The AAGUID is checked as the
 * text form here; an AAGUID is any 128 bits, not an RFC 4122 UUID.
 */
const importSchema = JSON.parse(readFileSync(new URL('./hanko.user_import.schema.json', import.meta.url), 'utf8'));
importSchema.$defs.UUID = { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' };
const importList = z.fromJSONSchema(importSchema);

const passkeyOf = (userId: string, portable: boolean) => ({
  userId,
  credentialId: `cred-${portable ? 'new' : 'old'}`,
  publicKey: 'pQECAyYgASFYIA',
  counter: 3,
  transports: portable ? ['internal', 'hybrid'] : null,
  nameOnDevice: 'Laptop',
  ...(portable && {
    aaguid: 'adce0002-35bc-c60a-648b-0b25f1f05503',
    attestationFormat: 'none',
    backupEligible: true,
    backupState: true,
    userHandle: 'aGFuZGxl',
  }),
});

describe('exportAccounts', () => {
  it('writes every account with a proven address in the shape Hanko imports, under the same ids', async () => {
    const user = await createTotpUser('export@example.com');
    const other = await createTestUser('other@example.com');
    await insertAnonymousUser({ var: { db } }, { id: crypto.randomUUID(), name: 'Guest', slug: 'guest' });
    await db.insert(passkeysTable).values([passkeyOf(user.id, true), passkeyOf(other.id, false)]);

    const accounts = await exportAccounts({ var: { db } });

    expect(importList.parse(accounts)).toEqual(accounts);
    expect(accounts.map((account) => account.user_id).sort()).toEqual([user.id, other.id].sort());

    const exported = accounts.find((account) => account.user_id === user.id);
    expect(exported?.emails).toEqual([{ address: 'export@example.com', is_primary: true, is_verified: true }]);
    expect(exported?.otp_secret?.secret).toBe(testTotpSecret);
    expect(exported?.webauthn_credentials).toEqual([
      expect.objectContaining({
        id: 'cred-new',
        name: 'Laptop',
        public_key: 'pQECAyYgASFYIA',
        attestation_type: 'none',
        aaguid: 'adce0002-35bc-c60a-648b-0b25f1f05503',
        sign_count: 3,
        transports: ['internal', 'hybrid'],
        backup_eligible: true,
        backup_state: true,
        mfa_only: false,
        user_handle: 'aGFuZGxl',
      }),
    ]);

    // A passkey from before the portability columns: the unknown AAGUID, no backup, no handle.
    const legacy = accounts.find((account) => account.user_id === other.id)?.webauthn_credentials?.[0];
    expect(legacy).toMatchObject({
      aaguid: '00000000-0000-0000-0000-000000000000',
      backup_eligible: false,
      backup_state: false,
      user_handle: '',
      transports: [],
    });
  });
});
