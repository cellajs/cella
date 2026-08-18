import { count } from 'drizzle-orm';
import type { EntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { getEntityTable } from '#/tables';

interface CountEntityRowsOpts {
  entityType: EntityType;
}

export const countEntityRows = async (ctx: DbContext, { entityType }: CountEntityRowsOpts) => {
  const { db } = ctx.var;
  const table = getEntityTable(entityType);
  const [{ total }] = await db.select({ total: count() }).from(table);
  return total;
};
