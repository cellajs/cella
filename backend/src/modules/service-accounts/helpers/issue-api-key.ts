import type { DbOrTx } from '#/db/db';
import {
  type ApiKeyModel,
  apiKeySafeColumns,
  apiKeysTable,
  type InsertApiKeyModel,
} from '#/modules/service-accounts/api-keys-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';

type IssueInput = Pick<InsertApiKeyModel, 'principalId' | 'tenantId' | 'name' | 'scopes' | 'expiresAt' | 'createdBy'>;

/** Mints a secret key for a principal. Only the hash is stored; the plaintext `secret` is returned once. */
export async function issueApiKey(db: DbOrTx, input: IssueInput): Promise<{ apiKey: ApiKeyModel; secret: string }> {
  const { key, parsed } = generateApiKey('secret');
  const [apiKey] = await db
    .insert(apiKeysTable)
    .values({ ...input, ...parsed })
    .returning(apiKeySafeColumns);
  return { apiKey, secret: key };
}
