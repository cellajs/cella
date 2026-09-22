import type { UserContext } from '#/core/context';
import { loadManagedServiceAccount } from '#/modules/service-accounts/helpers/managed-service-account';
import { findCredentialsByPrincipal } from '#/modules/service-accounts/service-accounts-queries';

export async function getCredentialsOp(ctx: UserContext, serviceAccountId: string) {
  const account = await loadManagedServiceAccount(ctx, serviceAccountId);
  return { items: await findCredentialsByPrincipal(ctx, { principalId: account.id }) };
}
