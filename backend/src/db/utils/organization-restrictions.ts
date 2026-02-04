import { appConfig, type EntityType } from 'shared';

export type Restrictions = Record<Exclude<EntityType, 'organization'>, number>;

export const defaultRestrictions = (): Restrictions => {
  const defaultConfig: Partial<Restrictions> = appConfig.defaultOrganizationRestrictions;

  return appConfig.entityTypes
    .filter((entityType) => entityType !== 'organization')
    .reduce((acc, entityType) => {
      acc[entityType] = defaultConfig[entityType] ?? 0;
      return acc;
    }, {} as Restrictions);
};
