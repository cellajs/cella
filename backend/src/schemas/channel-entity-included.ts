import { z } from '@hono/zod-openapi';
import { type ChannelEntityType, hierarchy, recordFromKeys } from 'shared';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { membershipCountSchema } from '#/schemas/count-schemas';
import { userMinimalBaseSchema } from '#/schemas/user-minimal-base';

/**
 * Factory for channel entity included schemas.
 * Builds a strictly-typed included schema scoped to the entity's hierarchy children.
 */
export const channelEntityIncludedSchema = (entityType: ChannelEntityType) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entityCountSchema = z.object(recordFromKeys(descendants, () => z.number()));

  // Per-stream activity stamps per product descendant: epoch ms of the latest post
  // (created, null when never posted) and latest content update (updated, null when never updated)
  const productDescendants = descendants.filter((descendant) => hierarchy.isProduct(descendant));
  const activitySchema = z.object(
    recordFromKeys(productDescendants, () =>
      z.object({ created: z.number().nullable(), updated: z.number().nullable() }),
    ),
  );

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
