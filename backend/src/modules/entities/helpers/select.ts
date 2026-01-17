import { ContextEntityType } from 'config';
import { getTableColumns } from 'drizzle-orm';
import { pickColumns } from '#/db/utils/pick-columns';
import { contextEntityBaseSchema } from '#/modules/entities/entities-schema-base';
import { entityTables } from '#/table-config';

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
