import type { DbOrTx } from '#/db/db';
import {
  type CredentialModel,
  credentialSafeColumns,
  credentialsTable,
  type InsertCredentialModel,
} from '#/modules/service-accounts/credentials-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';

type IssueInput = Pick<
  InsertCredentialModel,
  'principalId' | 'tenantId' | 'name' | 'description' | 'scopes' | 'expiresAt' | 'createdBy'
>;

/** Mints a secret key for a principal. Only the hash is stored; the plaintext `secret` is returned once. */
export async function issueCredential(
  db: DbOrTx,
  input: IssueInput,
): Promise<{ credential: CredentialModel; secret: string }> {
  const { key, parsed } = generateApiKey('secret');
  const [credential] = await db
    .insert(credentialsTable)
    .values({ ...input, ...parsed })
    .returning(credentialSafeColumns);
  return { credential, secret: key };
}
