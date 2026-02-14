import { eq, inArray } from 'drizzle-orm';
import type { DbOrTx } from '#/db/db';
import { entityTables, hasSlug } from '#/table-config';

export type EntityType = keyof typeof entityTables;
export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

/**
 * Key trick: preserve key->value correlation.
 * Without this helper, TS often widens `entityTables[entityType]`
 * to a union of all tables, which Drizzle v1 rejects in `.from(...)`.
 */
function getEntityTable<T extends EntityType>(entityType: T): (typeof entityTables)[T] {
  return entityTables[entityType];
}

/**
 * @internal Resolves an entity by ID or slug from its table.
 *
 * **Do not use directly in route handlers.** Use the permission-checking wrappers instead:
 * - `getValidContextEntity` for context entities (e.g., organization)
 * - `getValidProductEntity` for product entities (e.g., attachment, page)
 *
 * Direct usage is only appropriate in internal utilities (e.g., slug availability checks)
 * or self-operations where the user acts on their own data without permission checks.
 */
export async function resolveEntity<T extends EntityType>(
  entityType: T,
  identifier: string,
  db: DbOrTx,
  bySlug = false,
): Promise<EntityModel<T> | undefined> {
  const table = getEntityTable(entityType);

  const condition = bySlug && hasSlug(table) ? eq(table.slug, identifier) : eq(table.id, identifier);

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle .from() rejects generic table types (https://github.com/drizzle-team/drizzle-orm/issues/4367)
  const [entity] = await db
    .select()
    .from(table as any)
    .where(condition);
  return entity as EntityModel<T> | undefined;
}

/**
 * @internal Resolves multiple entities by IDs. See `resolveEntity` for usage guidelines.
 */
export async function resolveEntities<T extends EntityType>(
  entityType: T,
  ids: string[],
  db: DbOrTx,
): Promise<Array<EntityModel<T>>> {
  if (!ids.length) return [];

  const table = getEntityTable(entityType);

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle .from() rejects generic table types (https://github.com/drizzle-team/drizzle-orm/issues/4367)
  const entities = await db
    .select()
    .from(table as any)
    .where(inArray(table.id, ids));
  return entities as Array<EntityModel<T>>;
}
