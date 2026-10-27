import type { DbContext } from '#/core/context';
import type { InsertApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';
import { insertApiKey } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateApiKeyInput } from '#/modules/service-accounts/service-accounts-schema';

interface IssueApiKeyOpts extends Pick<InsertApiKeyModel, 'actorId' | 'tenantId' | 'createdBy'> {
  key: Pick<CreateApiKeyInput, 'name' | 'scopes' | 'expiresAt'>;
}

/**
 * Mints a secret key for a service account and stores its hash, prefix and last four, whichever route issues it.
 * @returns The stored key, and the plaintext for the response that shows it once.
 */
export async function issueApiKey(ctx: DbContext, { actorId, tenantId, createdBy, key }: IssueApiKeyOpts) {
  const { key: secret, parsed } = generateApiKey('secret');
  const apiKey = await insertApiKey(ctx, {
    values: { actorId, tenantId, name: key.name, scopes: key.scopes ?? null, expiresAt: key.expiresAt, createdBy, ...parsed },
  });
  return { apiKey, secret };
}
