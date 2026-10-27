import type { ChannelEntityType } from 'shared';
import type { DbContext } from '#/core/context';
import { resolveEntity } from '#/modules/entities/entities-queries';

/** The entity types whose rows carry a slug. */
export type EntityTypeWithSlug = ChannelEntityType | 'user';

/** Whether no row of `entityType` holds `slug`, in any tenant: a slug is unique across tenants. */
export async function checkSlugAvailable(ctx: DbContext, slug: string, entityType: EntityTypeWithSlug) {
  const result = await resolveEntity(ctx, { entityType, identifier: slug, bySlug: true });
  return !result;
}

/** Returns a Map of slug to availability; true means free. */
export async function checkSlugsAvailable(ctx: DbContext, slugs: string[], entityType: EntityTypeWithSlug) {
  const checks = slugs.map(async (slug) => ({ slug, available: await checkSlugAvailable(ctx, slug, entityType) }));
  const results = await Promise.all(checks);
  return new Map(results.map(({ slug, available }) => [slug, available]));
}

/** Whether a channel slug is free, for a client that checks before it creates or renames. */
export async function checkSlugOp(ctx: DbContext, slug: string, entityType: ChannelEntityType): Promise<{ available: boolean }> {
  const available = await checkSlugAvailable(ctx, slug, entityType);
  return { available };
}
