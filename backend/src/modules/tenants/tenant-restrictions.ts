import { appConfig, type EntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';

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
  /** Whether users of this tenant may consent to OAuth clients that are not installed by an admin (MCP clients by CIMD). */
  allowConsentedClients: boolean;
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
    allowConsentedClients: true,
  };
};

/**
 * Rejects when the tenant's hard cap for `key` is reached (0 = unlimited). `existing` is the count the caller already
 * holds; `adding` the rows about to be created. System admins bypass, as they do for organizations.
 */
export function assertTenantQuota(ctx: ActorContext, key: QuotaKey, existing: number, adding = 1): void {
  const quota = ctx.var.tenant.restrictions.quotas[key];
  if (ctx.var.isSystemAdmin || quota === 0 || existing + adding <= quota) return;
  throw new AppError(403, 'restrict_by_app', 'warn', { meta: { resource: key, quota } });
}

/** Merge stored restrictions with current defaults so stored rows gain missing fields. */
export const normalizeRestrictions = (stored?: Partial<Restrictions> | null): Restrictions => {
  const defaults = defaultRestrictions();
  return {
    quotas: { ...defaults.quotas, ...stored?.quotas },
    rateLimits: { ...defaults.rateLimits, ...stored?.rateLimits },
    allowConsentedClients: stored?.allowConsentedClients ?? defaults.allowConsentedClients,
  };
};
