import type { ContextEntityType } from 'shared';
import type { DbOrTx } from '#/db/db';
import { resolveEntity } from './resolve-entity';

type EntityTypeWithSlug = ContextEntityType | 'user';

/**
 * Checks if a slug is available for a specific entity type.
 *
 * @param db - Database or transaction to use (from ctx.var.db).
 * @param slug - The slug to check for availability.
 * @param entityType - The type of entity to check against.
 * @returns Boolean (true if available, false if taken).
 */
export const checkSlugAvailable = async (db: DbOrTx, slug: string, entityType: EntityTypeWithSlug) => {
  const result = await resolveEntity(db, entityType, slug, true);
  return !result;
};

/**
 * Batch check slug availability. Returns a Map of slug -> boolean (true = available).
 * @param db - Database or transaction to use (from ctx.var.db).
 * @param slugs - Array of slugs to check.
 * @param entityType - The type of entity to check against.
 */
export const checkSlugsAvailable = async (db: DbOrTx, slugs: string[], entityType: EntityTypeWithSlug) => {
  const results = await Promise.all(
    slugs.map(async (slug) => ({
      slug,
      available: await checkSlugAvailable(db, slug, entityType),
    })),
  );
  return new Map(results.map((r) => [r.slug, r.available]));
};
