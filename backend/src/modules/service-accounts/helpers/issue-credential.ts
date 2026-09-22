import { appConfig } from 'shared';
import type { DbOrTx } from '#/db/db';
import {
  type CredentialModel,
  credentialsTable,
  type InsertCredentialModel,
} from '#/modules/service-accounts/credentials-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';

type IssueInput = Pick<
  InsertCredentialModel,
  'principalId' | 'tenantId' | 'name' | 'description' | 'scopes' | 'expiresAt' | 'createdBy'
>;

/** Only the hash is stored; the plaintext `secret` is returned once to the caller and then exists nowhere. */
export function omitHash(row: CredentialModel & { hash?: string }): CredentialModel {
  const { hash: _hash, ...safe } = row;
  return safe;
}

/** Mints a secret key for a principal. `test` keys are everything but production, matching the deploy mode. */
export async function issueCredential(
  db: DbOrTx,
  input: IssueInput,
): Promise<{ credential: CredentialModel; secret: string }> {
  const { key, parsed } = generateApiKey('sk', appConfig.mode === 'production' ? 'live' : 'test');
  const [row] = await db
    .insert(credentialsTable)
    .values({ ...input, type: 'secret', prefix: parsed.prefix, last4: parsed.last4, hash: parsed.hash })
    .returning();
  return { credential: omitHash(row), secret: key };
}
