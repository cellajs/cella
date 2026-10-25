import type { ActorContext } from '#/core/context';
import { withActorRef } from '#/modules/actors/actor-refs';
import { findProductViewCount } from '#/modules/entities/entities-queries';
import { getValidProduct } from '#/permissions/get-valid-product';

export async function getAttachmentOp(ctx: ActorContext, id: string) {
  const { entity: attachment } = await getValidProduct(ctx, id, 'attachment', 'read');

  // withActorRef queries actors (no RLS), findProductViewCount queries counters (no RLS)
  const attachmentResponse = await withActorRef(ctx, attachment);
  const viewCount = await findProductViewCount(ctx, { productId: id });

  return { ...attachmentResponse, viewCount };
}
