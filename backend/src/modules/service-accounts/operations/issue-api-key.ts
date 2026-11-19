import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { InsertApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import { generateApiKey } from '#/modules/service-accounts/helpers/api-key';
import type { ServiceAccountModel } from '#/modules/service-accounts/service-accounts-db';
import { insertApiKey } from '#/modules/service-accounts/service-accounts-queries';
import type { CreateApiKeyInput } from '#/modules/service-accounts/service-accounts-schema';

interface IssueApiKeyOpts extends Pick<InsertApiKeyModel, 'createdBy'> {
  account: Pick<ServiceAccountModel, 'id' | 'tenantId' | 'oauthClientId' | 'connectionId'>;
  key: Pick<CreateApiKeyInput, 'name' | 'scopes' | 'expiresAt'>;
}

/**
 * Mints a secret key for a service account and stores its hash, prefix and last four, whichever route issues it. An
 * account that installs an app or an LTI tool acts through that registration, never through a key, and so does the
 * account an LTI connection writes as.
 * @returns The stored key, and the plaintext for the response that shows it once.
 * @throws AppError 409 `installation_takes_no_api_key` for an account with an `oauthClientId` or a `connectionId`.
 */
export async function issueApiKey(ctx: DbContext, { account, createdBy, key }: IssueApiKeyOpts) {
  if (account.oauthClientId || account.connectionId)
    throw new AppError(409, 'installation_takes_no_api_key', 'warn', { meta: { serviceAccountId: account.id } });
  const { id: actorId, tenantId } = account;
  const { key: secret, parsed } = generateApiKey('secret');
  const apiKey = await insertApiKey(ctx, {
    values: { actorId, tenantId, name: key.name, scopes: key.scopes ?? null, expiresAt: key.expiresAt, createdBy, ...parsed },
  });
  return { apiKey, secret };
}
