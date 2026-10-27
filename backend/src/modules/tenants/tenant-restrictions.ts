import { appConfig, type EntityType } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';

/**
 * Quotas on machine actors and their keys, beside the entity quotas; one place to extend for a new kind.
 * @public
 */
export const machineQuotaKeys = ['serviceAccount', 'apiKey'] as const;

/** Hard caps per tenant on entities and on machine actors and their keys. 0 = unlimited. */
export type QuotaKey = EntityType | (typeof machineQuotaKeys)[number];
export type Quotas = Record<QuotaKey, number>;

export const quotaKeys: QuotaKey[] = [...appConfig.entityTypes, ...machineQuotaKeys];

/** Time-windowed throughput limits per user in the tenant. 0 = no tenant limit; the limiter's global safety ceiling still applies. */
export type RateLimits = {
  /** Max API points per hour per user within this tenant */
  apiPointsPerHour: number;
};

export type Restrictions = {
  quotas: Quotas;
  rateLimits: RateLimits;
  /** Whether users of this tenant may consent to OAuth clients that are not installed by an admin (MCP clients by CIMD). */
  allowUnregisteredClients: boolean;
};

export const defaultRestrictions = (): Restrictions => {
  const defaultQuotas: Partial<Quotas> = appConfig.defaultRestrictions.quotas;

  const quotas = quotaKeys.reduce((acc, key) => {
    acc[key] = defaultQuotas[key] ?? 0;
    return acc;
  }, {} as Quotas);

  return {
    quotas,
    rateLimits: { apiPointsPerHour: appConfig.defaultRestrictions.rateLimits.apiPointsPerHour },
    allowUnregisteredClients: true,
  };
};

/**
 * Rejects one more service account or API key once the tenant's cap on it is reached (0 = unlimited). `existing` is
 * the count the tenant holds now. System admins bypass. Entity quotas keep checks of their own: the organization's 1:1
 * slot binds system admins too and clamps a batch.
 * @throws AppError 403 `restrict_by_app` with the key in `meta.resource` and the cap in `meta.quota`.
 */
export function assertTenantQuota(ctx: ActorContext, key: (typeof machineQuotaKeys)[number], existing: number): void {
  const quota = ctx.var.tenant.restrictions.quotas[key];
  if (ctx.var.isSystemAdmin || quota === 0 || existing < quota) return;
  throw new AppError(403, 'restrict_by_app', 'warn', { meta: { resource: key, quota } });
}

/** A partial restrictions update, or a stored row that predates a field: what `mergeRestrictions` lays over a base. */
type RestrictionsPatch = { quotas?: Partial<Quotas>; rateLimits?: Partial<RateLimits>; allowUnregisteredClients?: boolean };

/** Lays `patch` over `base` field by field, so a key the patch leaves out keeps the base's value. */
export const mergeRestrictions = (base: Restrictions, patch?: RestrictionsPatch | null): Restrictions => ({
  quotas: { ...base.quotas, ...patch?.quotas },
  rateLimits: { ...base.rateLimits, ...patch?.rateLimits },
  allowUnregisteredClients: patch?.allowUnregisteredClients ?? base.allowUnregisteredClients,
});

/** Merge stored restrictions with current defaults so stored rows gain missing fields. */
export const normalizeRestrictions = (stored?: Partial<Restrictions> | null): Restrictions => mergeRestrictions(defaultRestrictions(), stored);
