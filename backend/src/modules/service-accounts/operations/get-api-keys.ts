import type { UserContext } from '#/core/context';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { findApiKeysByPrincipal } from '#/modules/service-accounts/service-accounts-queries';

export async function getApiKeysOp(ctx: UserContext, serviceAccountId: string) {
  const account = await loadManagedServiceAccount(ctx, serviceAccountId);
  return { items: await findApiKeysByPrincipal(ctx, { principalId: account.id }) };
}
