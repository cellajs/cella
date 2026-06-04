import type { ContextEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import type { OperationResult } from '#/core/operation-result';
import { checkSlugAvailable } from '#/modules/entities/helpers/check-slug';

export async function checkSlugOp(
  ctx: DbContext,
  slug: string,
  entityType: ContextEntityType,
): Promise<OperationResult<{ available: boolean }>> {
  const available = await checkSlugAvailable(ctx, slug, entityType);
  return { success: true, data: { available } };
}
