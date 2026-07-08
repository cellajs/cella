import { z } from '@hono/zod-openapi';
import {
  appConfig,
  type EntityIdColumns,
  type EntityType,
  hierarchy,
  type ProductEntityType,
  type RelatedContextType,
} from 'shared';

/**
 * Zod raw-shape type for an entity's optional related-context id fields.
 */
export type RelatedContextShape<E extends string> = EntityIdColumns<
  RelatedContextType<E> & EntityType,
  z.ZodOptional<z.ZodString>
>;

/**
 * Builds a Zod raw shape with optional uuid fields for an entity's declared `relatedContexts`.
 * Spread into request body/query schemas to expose denormalized context references without
 * hardcoding fork-specific column names. Returns an empty shape when the entity has none.
 *
 * Counterpart to `contextRelationColumns` (which builds the drizzle columns): this keeps the
 * request/query validation layer in lockstep with the hierarchy config, so forks only adjust
 * the hierarchy rather than each schema.
 */
export const relatedContextShape = <E extends ProductEntityType>(entityType: E): RelatedContextShape<E> => {
  const shape = {} as Record<string, z.ZodOptional<z.ZodString>>;

  for (const related of hierarchy.getRelatedContexts(entityType)) {
    shape[appConfig.entityIdColumnKeys[related]] = z.string().uuid().optional();
  }

  return shape as RelatedContextShape<E>;
};
