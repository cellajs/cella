import { appConfig, type EntityType, recordFromKeys } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { Restrictions } from '#/modules/tenants/tenants-schema';
import { applyMergePatch, type MergePatch } from '#/utils/merge-patch';

/** Quotas on machine actors and their keys, beside the entity quotas; one place to extend for a new kind. */
const machineQuotaKeys = ['serviceAccount', 'apiKey'] as const;

type QuotaKey = EntityType | (typeof machineQuotaKeys)[number];

/** Every key a tenant quota can name: the entity types, then the machine keys. */
export const quotaKeys: QuotaKey[] = [...appConfig.entityTypes, ...machineQuotaKeys];

/** The restrictions a new tenant starts with: `appConfig.defaultRestrictions`, 0 for a quota it does not list. */
export const defaultRestrictions = (): Restrictions => {
  const defaultQuotas: Partial<Restrictions['quotas']> = appConfig.defaultRestrictions.quotas;

  return {
    quotas: recordFromKeys(quotaKeys, (key) => defaultQuotas[key] ?? 0),
    rateLimits: { ...appConfig.defaultRestrictions.rateLimits },
    allowUnregisteredClients: true,
  };
};

/**
 * Rejects when the tenant's hard cap on `key` would be passed (0 = unlimited). `existing` is the count the tenant holds
 * now, `adding` the rows about to be created. System admins bypass. Organizations keep a check of their own: the 1:1
 * slot binds system admins too and clamps a batch.
 * @throws AppError 403 `restrict_by_app` with the key in `meta.resource` and the cap in `meta.quota`; an entity key also
 * sets `entityType`.
 */
export const assertTenantQuota = (ctx: ActorContext, key: QuotaKey, existing: number, adding = 1): void => {
  const quota = ctx.var.tenant.restrictions.quotas[key];
  if (ctx.var.isSystemAdmin || quota === 0 || existing + adding <= quota) return;
  const entityType = appConfig.entityTypes.find((type) => type === key);
  throw new AppError(403, 'restrict_by_app', 'warn', { ...(entityType && { entityType }), meta: { resource: key, quota } });
};

/** Stored restrictions laid over the current defaults, so a row gains the fields it predates or a patch removed. */
export const normalizeRestrictions = (stored?: MergePatch<Restrictions> | null): Restrictions => applyMergePatch(defaultRestrictions(), stored ?? {});
