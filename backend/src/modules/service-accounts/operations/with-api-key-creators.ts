import type { DbContext } from '#/core/context';
import type { ApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import type { UserMinimalBase } from '#/modules/user/helpers/audit-user';
import { withAuditUsers } from '#/modules/user/operations/with-audit-users';

/** An API key as responses carry it: `createdBy` is the user who issued it, null once that user is gone. */
export type ApiKeyWithCreator = Omit<ApiKeyModel, 'createdBy'> & { createdBy: UserMinimalBase | null };

/** Resolves `createdBy` of API keys to the minimal user. Only people issue keys, so it never names a service account. */
export async function withApiKeyCreators(ctx: DbContext, apiKeys: ApiKeyModel[]): Promise<ApiKeyWithCreator[]> {
  const hydrated = await withAuditUsers(ctx, apiKeys);
  return hydrated.map(({ updatedBy: _updatedBy, ...apiKey }) => apiKey);
}

/** Single-key wrapper around withApiKeyCreators. */
export async function withApiKeyCreator(ctx: DbContext, apiKey: ApiKeyModel): Promise<ApiKeyWithCreator> {
  const [result] = await withApiKeyCreators(ctx, [apiKey]);
  return result;
}
