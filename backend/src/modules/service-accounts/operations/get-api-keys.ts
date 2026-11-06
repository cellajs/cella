import type { UserContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import { getManagedServiceAccount } from '#/modules/service-accounts/operations/get-managed-service-account';
import { findApiKeysByActor } from '#/modules/service-accounts/service-accounts-queries';
import { type PageWindow, windowOf } from '#/utils/list-page';

/** A window of the keys of a service account the caller may manage, newest first, without their hashes. */
export async function getApiKeysOp(ctx: UserContext, serviceAccountId: string, page: PageWindow) {
  const account = await getManagedServiceAccount(ctx, serviceAccountId);
  const { items, total } = windowOf(await findApiKeysByActor(ctx, { actorId: account.id }), page);
  return { items: await withActorRefs(ctx, items), total };
}
