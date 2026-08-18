import { z } from '@hono/zod-openapi';
import type { EntityIdColumns, EntityType, ProductEntityType, RelatedChannelType } from 'shared';
import { appConfig, hierarchy } from 'shared';

export type RelatedChannelShape<E extends string> = EntityIdColumns<
  RelatedChannelType<E> & EntityType,
  z.ZodOptional<z.ZodString>
>;

/** Optional uuid fields for the entity's `relatedChannels`: the validation twin of `channelRelationColumns`. */
export const relatedChannelShape = <E extends ProductEntityType>(entityType: E): RelatedChannelShape<E> => {
  const shape = {} as Record<string, z.ZodOptional<z.ZodString>>;

  for (const related of hierarchy.getRelatedChannels(entityType)) {
    shape[appConfig.entityIdColumnKeys[related]] = z.string().uuid().optional();
  }

  return shape as RelatedChannelShape<E>;
};
