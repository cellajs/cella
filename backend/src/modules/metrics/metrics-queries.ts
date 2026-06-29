import { count } from 'drizzle-orm';
import type { EntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { getEntityTable } from '#/tables';

/** Count total rows in a given entity table. */
export const countEntityRows = async (ctx: DbContext, { entityType }: { entityType: EntityType }) => {
  const { db } = ctx.var;
  const table = getEntityTable(entityType);
  const [{ total }] = await db.select({ total: count() }).from(table);
  return total;
};
