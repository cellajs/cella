import { z } from '@hono/zod-openapi';
import { appConfig, type EntityType, recordFromKeys, roles } from 'shared';

/** Entity types excluded from entity count schemas (they are the context themselves) */
type FilteredEntityType = Exclude<EntityType, 'user' | 'organization'>;

const isFilteredEntityType = (entityType: EntityType): entityType is FilteredEntityType => {
  return entityType !== 'user' && entityType !== 'organization';
};

/** Schema for counts of product/child entities (excludes user and organization) */
export const entityCountSchema = z.object(
  recordFromKeys(appConfig.entityTypes.filter(isFilteredEntityType), () => z.number()),
);

/** Schema for membership counts by role, plus pending and total */
export const membershipCountSchema = z.object({
  ...recordFromKeys(roles.all, () => z.number()),
  pending: z.number(),
  total: z.number(),
});

/** Combined schema for all counts: membership + entity counts */
export const fullCountsSchema = z.object({ membership: membershipCountSchema, entities: entityCountSchema });
