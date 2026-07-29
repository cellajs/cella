import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';

export async function checkSlugOp(
  ctx: DbContext,
  slug: string,
  entityType: ChannelEntityType,
): Promise<{ available: boolean }> {
  const available = await checkSlugAvailable(ctx, slug, entityType);
  return { available };
}
