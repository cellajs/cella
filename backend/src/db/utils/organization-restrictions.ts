import { type EntityType, config } from 'config';

export type Restrictions = Record<Exclude<EntityType, 'organization'>, number>;

export const defaultRestrictions = (): Restrictions => {
  const defaultConfig: Partial<Restrictions> = config.defaultOrganizationRestrictions;

  return config.entityTypes
    .filter((entityType) => entityType !== 'organization')
    .reduce((acc, entityType) => {
      acc[entityType] = defaultConfig[entityType] ?? 0;
      return acc;
    }, {} as Restrictions);
};
