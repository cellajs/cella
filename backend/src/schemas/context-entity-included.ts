import { z } from '@hono/zod-openapi';
import { type ContextEntityType, hierarchy, recordFromKeys } from 'shared';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { membershipCountSchema } from '#/schemas/count-schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

/**
 * Factory for context entity included schemas.
 * Builds a strictly-typed included schema scoped to the entity's hierarchy children.
 */
export const contextEntityIncludedSchema = (entityType: ContextEntityType) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entityCountSchema = z.object(recordFromKeys(descendants, () => z.number()));

  // Per-stream activity stamps: epoch ms of the latest post per product descendant (null when never posted)
  const productDescendants = descendants.filter((descendant) => hierarchy.isProduct(descendant));
  const activitySchema = z.object(recordFromKeys(productDescendants, () => z.number().nullable()));

  const countsSchema = z.object({
    membership: membershipCountSchema,
    entities: entityCountSchema,
    activity: activitySchema,
  });

  return z.object({
    membership: membershipBaseSchema.optional(),
    counts: countsSchema.optional(),
    members: z.array(userMinimalBaseSchema).optional(),
  });
};
