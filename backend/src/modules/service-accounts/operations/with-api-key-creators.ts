import type { DbContext } from '#/core/context';
import { withActorRefs } from '#/modules/actors/actor-refs';
import type { ApiKeyModel } from '#/modules/service-accounts/api-keys-db';
import type { ActorRef } from '#/schemas/actor-ref';

/** An API key as responses carry it: `createdBy` is the user who issued it, null once that user is gone. */
export type ApiKeyWithCreator = Omit<ApiKeyModel, 'createdBy'> & { createdBy: ActorRef | null };

/** Resolves `createdBy` of API keys to the issuer's reference. Only people issue keys, so it never names a service account. */
export async function withApiKeyCreators(ctx: DbContext, apiKeys: ApiKeyModel[]): Promise<ApiKeyWithCreator[]> {
  return withActorRefs(ctx, apiKeys);
}

/** Single-key wrapper around withApiKeyCreators. */
export async function withApiKeyCreator(ctx: DbContext, apiKey: ApiKeyModel): Promise<ApiKeyWithCreator> {
  const [result] = await withApiKeyCreators(ctx, [apiKey]);
  return result;
}
