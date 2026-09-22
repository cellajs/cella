import { appConfig, type EntityType } from 'shared';

/** Hard caps per tenant on entities and on machine principals and their keys. 0 = unlimited. */
export type QuotaKey = EntityType | 'serviceAccount' | 'credential';
export type Quotas = Record<QuotaKey, number>;

/** Time-windowed throughput limits per user in the tenant. 0 = no tenant limit; the limiter's global safety ceiling still applies. */
export type RateLimits = {
  /** Max API points per hour per user within this tenant */
  apiPointsPerHour: number;
};

export type Restrictions = {
  quotas: Quotas;
  rateLimits: RateLimits;
};

export const defaultRestrictions = (): Restrictions => {
  const defaultQuotas: Partial<Quotas> = appConfig.defaultRestrictions.quotas;

  const quotaKeys: QuotaKey[] = [...appConfig.entityTypes, 'serviceAccount', 'credential'];
  const quotas = quotaKeys.reduce((acc, key) => {
    acc[key] = defaultQuotas[key] ?? 0;
    return acc;
  }, {} as Quotas);

  return {
    quotas,
    rateLimits: {
      apiPointsPerHour: appConfig.defaultRestrictions.rateLimits.apiPointsPerHour,
    },
  };
};

/** Merge stored restrictions with current defaults so stored rows gain missing fields. */
export const normalizeRestrictions = (stored?: Partial<Restrictions> | null): Restrictions => {
  const defaults = defaultRestrictions();
  return {
    quotas: { ...defaults.quotas, ...stored?.quotas },
    rateLimits: { ...defaults.rateLimits, ...stored?.rateLimits },
  };
};
