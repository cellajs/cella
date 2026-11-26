import { z } from '@hono/zod-openapi';
import { type ChannelEntityType, hierarchy, isProduct, recordFromKeys } from 'shared';
import { membershipBaseSchema } from '#/modules/memberships/memberships-schema';
import { appChannelCountFields } from '#/schemas/app-schemas';
import { membershipCountSchema } from '#/schemas/count-schemas';
import { userMinimalBaseSchema } from '#/schemas/minimal-base';
import { channelToolsConfigSchema } from '#/schemas/tools-config';

/** Scoped to the entity's hierarchy children. */
const includedSchema = (entityType: ChannelEntityType) => {
  const descendants = hierarchy.getOrderedDescendants(entityType);
  const entityCountSchema = z.object(recordFromKeys(descendants, () => z.number()));

  // Per product descendant, epoch ms of the latest post and the latest content update; null when never.
  const productDescendants = descendants.filter((descendant) => isProduct(descendant));
  const activitySchema = z.object(
    recordFromKeys(productDescendants, () => z.object({ created: z.number().nullable(), updated: z.number().nullable() })),
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

// Required: the compiler names every response builder of a channel below the organization that leaves it out.
const withInheritedLayer = (included: ReturnType<typeof includedSchema>, entityType: ChannelEntityType) =>
  included.extend({
    inheritedToolsConfig: channelToolsConfigSchema(entityType).describe(
      "What the channels above it store for its slots, stacked organization first: their hidden ids add up and the narrowest order leads. The row's own `toolsConfig` applies on top. Sent whether or not the reader reads those channels, and not part of the `ETag`.",
    ),
  });

type ChannelIncludedSchema<T extends ChannelEntityType> = T extends 'organization'
  ? ReturnType<typeof includedSchema>
  : ReturnType<typeof withInheritedLayer>;

/**
 * A channel response's `included`, scoped to the entity's hierarchy children. Below the organization it also holds
 * `inheritedToolsConfig`, which `getInheritedToolsConfigs` reads.
 */
export const channelIncludedSchema = <T extends ChannelEntityType>(entityType: T): ChannelIncludedSchema<T> => {
  const included = includedSchema(entityType);
  // Cast: comparing `entityType` narrows the value, never `T`.
  return (entityType === 'organization' ? included : withInheritedLayer(included, entityType)) as ChannelIncludedSchema<T>;
};
