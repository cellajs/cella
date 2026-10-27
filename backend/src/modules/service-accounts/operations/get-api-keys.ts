import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { getManagedServiceAccount } from '#/modules/service-accounts/operations/get-managed-service-account';
import { findApiKeysByActor } from '#/modules/service-accounts/service-accounts-queries';

/** The keys of a service account the caller may manage, newest first, without their hashes. */
export async function getApiKeysOp(ctx: UserContext, serviceAccountId: string) {
  const account = await getManagedServiceAccount(ctx, serviceAccountId);
  return { items: await withActorRefs(ctx, await findApiKeysByActor(ctx, { actorId: account.id })) };
}
