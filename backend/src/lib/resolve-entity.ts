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

export async function resolveEntity<T extends EntityType>(
  entityType: T,
  identifier: string,
  db: DbOrTx,
  bySlug = false,
): Promise<EntityModel<T> | undefined> {
  const table = getEntityTable(entityType);

  const condition = bySlug && hasSlug(table) ? eq(table.slug, identifier) : eq(table.id, identifier);

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle v1 .from() rejects generic indexed-access union types
  const [entity] = await db
    .select()
    .from(table as any)
    .where(condition);
  return entity as EntityModel<T> | undefined;
}

export async function resolveEntities<T extends EntityType>(
  entityType: T,
  ids: string[],
  db: DbOrTx,
): Promise<Array<EntityModel<T>>> {
  if (!ids.length) return [];

  const table = getEntityTable(entityType);

  // biome-ignore lint/suspicious/noExplicitAny: Drizzle v1 .from() rejects generic indexed-access union types
  const entities = await db
    .select()
    .from(table as any)
    .where(inArray(table.id, ids));
  return entities as Array<EntityModel<T>>;
}
