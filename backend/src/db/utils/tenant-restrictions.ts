import { appConfig, type EntityType } from 'shared';

/** Hard entity caps per tenant. 0 = unlimited. */
export type Quotas = Record<EntityType, number>;

/** Time-windowed throughput limits per user within the tenant. 0 = unlimited. */
export type RateLimits = {
  /** Max API points per hour per user within this tenant */
  apiPointsPerHour: number;
};

/** Combined restrictions stored on the tenant for quotas and rate limits */
export type Restrictions = {
  quotas: Quotas;
  rateLimits: RateLimits;
};

/**
 * Generates default restrictions for tenants based on the appConfig.
 * Includes entity quotas (hard caps) and rate limits (throughput).
 */
export const defaultRestrictions = (): Restrictions => {
  const defaultQuotas: Partial<Quotas> = appConfig.defaultRestrictions?.quotas ?? {};

  const quotas = appConfig.entityTypes.reduce((acc, entityType) => {
    acc[entityType] = defaultQuotas[entityType] ?? 0;
    return acc;
  }, {} as Quotas);

  return {
    quotas,
    rateLimits: {
      apiPointsPerHour: appConfig.defaultRestrictions?.rateLimits?.apiPointsPerHour ?? 1000,
    },
  };
};
