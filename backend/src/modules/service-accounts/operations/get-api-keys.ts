import type { UserContext } from '#/core/context';
import { requireManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { findApiKeysByActor } from '#/modules/service-accounts/service-accounts-queries';

export async function getApiKeysOp(ctx: UserContext, serviceAccountId: string) {
  const account = await requireManagedServiceAccount(ctx, serviceAccountId);
  return { items: await findApiKeysByActor(ctx, { actorId: account.id }) };
}
