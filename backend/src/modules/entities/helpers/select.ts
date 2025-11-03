import { ContextEntityType } from 'config';
import { getTableColumns } from 'drizzle-orm';
import { pickColumns } from '#/db/utils/pick-columns';
import { entityTables } from '#/entity-config';
import { contextEntityBaseSchema } from '#/modules/entities/schema-base';

/**
 * Context entity select for base data only.
 */
export const makeContextEntityBaseSelect = (entityType: ContextEntityType) => {
  const entityTable = entityTables[entityType];

  // Infer types of context entity base columns
  type TableColumns = (typeof entityTable)['_']['columns'];
  type ContextEntityBaseKeys = keyof typeof contextEntityBaseSchema.shape;
  type ContextEntityBaseSelect = Pick<TableColumns, ContextEntityBaseKeys>;

  const cols = getTableColumns(entityTable) satisfies TableColumns;
  const keys = Object.keys(contextEntityBaseSchema.shape) as ContextEntityBaseKeys[];
  return pickColumns(cols, keys) satisfies ContextEntityBaseSelect;
};
