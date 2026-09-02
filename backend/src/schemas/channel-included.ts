import { z } from '@hono/zod-openapi';
import { type ChannelEntityType, hierarchy, isProduct, recordFromKeys } from 'shared';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { appChannelCountFields } from '#/schemas/app-schemas';
import { membershipCountSchema } from '#/schemas/count-schemas';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';

/** Scoped to the entity's hierarchy children. */
export const channelIncludedSchema = (entityType: ChannelEntityType) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entityCountSchema = z.object(recordFromKeys(descendants, () => z.number()));

  // Per product descendant, epoch ms of the latest post and the latest content update; null when never.
  const productDescendants = descendants.filter((descendant) => isProduct(descendant));
  const activitySchema = z.object(
    recordFromKeys(productDescendants, () =>
      z.object({ created: z.number().nullable(), updated: z.number().nullable() }),
    ),
  );

  const countsSchema = z.object({
    membership: membershipCountSchema,
    entities: entityCountSchema,
    // Home-only twin of `entities` (`e:c:h:` keys): rows homed directly at the channel.
    entitiesSelf: entityCountSchema,
    activity: activitySchema,
    ...appChannelCountFields(entityType),
  });

  return z.object({
    membership: membershipBaseSchema.optional(),
    counts: countsSchema.optional(),
    members: z.array(userMinimalBaseSchema).optional(),
  });
};
