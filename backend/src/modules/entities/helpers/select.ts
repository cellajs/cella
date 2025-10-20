import { getTableColumns } from 'drizzle-orm';
import { organizationsTable } from '#/db/schema/organizations';
import { pickColumns } from '#/db/utils/pick-columns';
import { contextEntityBaseSchema } from '../schema-base';

// Infer types of context entity base columns
type TableColumns = (typeof organizationsTable)['_']['columns'];
type ContextEntityBaseKeys = keyof typeof contextEntityBaseSchema.shape;
type ContextEntityBaseSelect = Pick<TableColumns, ContextEntityBaseKeys>;

/**
 * Context entity select for base data only.
 */
export const contextEntityBaseSelect = (() => {
  const cols = getTableColumns(organizationsTable) satisfies TableColumns;
  const keys = Object.keys(contextEntityBaseSchema.shape) as ContextEntityBaseKeys[];
  return pickColumns(cols, keys);
})() satisfies ContextEntityBaseSelect;
