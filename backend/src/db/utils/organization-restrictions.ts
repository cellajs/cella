import { type Entity, config } from 'config';

export type Restrictions = Record<Exclude<Entity, 'organization'>, number>;

export const defaultOrgRestrictions = (): Restrictions => {
  const defaultConfig: Partial<Restrictions> = config.defaultOrganizationRestrictions;
  return config.entityTypes
    .filter((entity) => entity !== 'organization')
    .reduce((acc, entity) => {
      acc[entity] = defaultConfig[entity] ?? 0;
      return acc;
    }, {} as Restrictions);
};
