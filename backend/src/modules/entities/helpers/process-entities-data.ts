import { z } from '@hono/zod-openapi';
import { config, type PageEntityType } from 'config';
import { entityListItemSchema } from '#/modules/entities/schema';

const extendedEntitySchema = entityListItemSchema.extend({ total: z.number() });
type QueryData = z.infer<typeof extendedEntitySchema>;

export const processEntitiesData = (queryData: QueryData[][], type?: PageEntityType) => {
  const itemsData: Omit<QueryData, 'total'>[] = [];
  const counts: { [key in PageEntityType]?: number } = {};
  let total = 0;

  const entities = type ? [type] : config.pageEntityTypes;

  // Initialize counts
  for (const entityType of entities) counts[entityType] = 0;

  // Set entity count, total and push items without total
  for (const results of queryData) {
    if (results[0]) {
      const totalEntityType = results[0].entityType;
      const totalValue = Number(results[0].total);
      total += totalValue;
      counts[totalEntityType] = totalValue;
    }

    itemsData.push(...results.map(({ total, ...rest }) => rest));
  }

  return { counts, items: itemsData, total };
};
