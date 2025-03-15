import { type PageEntity, config } from 'config';

export const processEntitiesData = <T extends { entity: PageEntity; total: number }>(queryData: T[][], type?: PageEntity) => {
  const itemsData = [];
  const counts: { [key in PageEntity]?: number } = {};
  let total = 0;

  const entityTypes = type ? [type] : config.pageEntityTypes;

  // Initialize counts for each entity type
  for (const entityType of entityTypes) {
    counts[entityType] = 0;
  }

  // Set entity count, total and push items without total
  for (const results of queryData) {
    if (results[0]) {
      const totalEntityType = results[0].entity;
      const totalValue = Number(results[0].total);
      total += totalValue;
      counts[totalEntityType] = totalValue;
    }
    itemsData.push(...results.map(({ total, ...rest }) => rest));
  }

  return { counts, items: itemsData, total };
};
