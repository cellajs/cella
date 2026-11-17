import { and, eq } from 'drizzle-orm';
import type { ProductEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { productNumberMovesTable } from '#/modules/numbering/numbering-db';

/** The row that left `number` behind in a channel when it moved to another, with no request scope; undefined if none did. */
export const findMovedEntityId = async (ctx: DbContext, ref: { channelId: string; productType: ProductEntityType; number: number }) => {
  const [moved] = await ctx.var.db
    .select({ entityId: productNumberMovesTable.entityId })
    .from(productNumberMovesTable)
    .where(
      and(
        eq(productNumberMovesTable.channelId, ref.channelId),
        eq(productNumberMovesTable.productType, ref.productType),
        eq(productNumberMovesTable.number, ref.number),
      ),
    )
    .limit(1);
  return moved?.entityId;
};
