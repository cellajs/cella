import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';

export async function checkSlugOp(
  ctx: DbContext,
  slug: string,
  entityType: ChannelEntityType,
): Promise<OperationResult<{ available: boolean }>> {
  const available = await checkSlugAvailable(ctx, slug, entityType);
  return { success: true, data: { available } };
}
