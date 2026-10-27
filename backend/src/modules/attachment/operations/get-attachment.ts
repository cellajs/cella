import type { ActorContext } from '#/core/context';
import { withActorRef } from '#/modules/actors/actor-refs';
import { findProductViewCount } from '#/modules/entities/entities-queries';
import { getValidProduct } from '#/permissions/get-valid-product';

/**
 * One attachment the caller may read, with its writers resolved and its view count.
 * @throws AppError 404 when the row is missing, deleted, outside the request or unreadable to the caller.
 */
export async function getAttachmentOp(ctx: ActorContext, id: string) {
  const { entity: attachment } = await getValidProduct(ctx, id, 'attachment', 'read');

  // withActorRef queries actors (no RLS), findProductViewCount queries counters (no RLS)
  const attachmentResponse = await withActorRef(ctx, attachment);
  const viewCount = await findProductViewCount(ctx, { productId: id });

  return { ...attachmentResponse, viewCount };
}
