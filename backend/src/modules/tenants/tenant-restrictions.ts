import { appConfig, type EntityType, type RestrictionCap, recordFromKeys, type TenantKind, type TenantKindConfig, tenantKindValues } from 'shared';
import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { TenantModel } from '#/modules/tenants/tenants-db';
import type { Restrictions } from '#/modules/tenants/tenants-schema';
import { getIsoDate } from '#/utils/iso-date';
import { applyMergePatch, type MergePatch } from '#/utils/merge-patch';

/** Quotas beside the entity quotas: machine actors, their keys and LTI connections; one place to extend for a new kind. */
const otherQuotaKeys = ['serviceAccount', 'apiKey', 'ltiConnection'] as const;

type QuotaKey = EntityType | (typeof otherQuotaKeys)[number];

/** Every key a tenant quota can name: the entity types, then the others. */
export const quotaKeys: QuotaKey[] = [...appConfig.entityTypes, ...otherQuotaKeys];

/** The restrictions a tenant reads where it stores none: `appConfig.defaultRestrictions`, which names a quota for every key. */
export const defaultRestrictions = (): Restrictions => {
  // A missing quota fails the typecheck here: the config's own type cannot see the app's entity types.
  const quotas: Record<QuotaKey, RestrictionCap> = appConfig.defaultRestrictions.quotas;
  const { rateLimits, allowUnregisteredClients } = appConfig.defaultRestrictions;
  return { quotas: recordFromKeys(quotaKeys, (key) => quotas[key]), rateLimits: { ...rateLimits }, allowUnregisteredClients };
};

/** Whether `used` fits under `cap`. */
const withinCap = (cap: RestrictionCap, used: number): boolean => cap === 'unlimited' || used <= cap;

/** The restrictions a new tenant of `kind` starts with: the defaults, with the kind's patch (`appConfig.tenantKinds`) laid over. */
export const kindRestrictions = (kind: TenantKind): Restrictions => {
  // The config literal types each kind by its own keys; the shared type names the optional patch.
  const kindConfig: TenantKindConfig = appConfig.tenantKinds[kind];
  return applyMergePatch(defaultRestrictions(), kindConfig.restrictions ?? {});
};

/** The kinds whose tenants an admin list shows when the request names none. */
export const listedTenantKinds = (): TenantKind[] => tenantKindValues.filter((kind) => appConfig.tenantKinds[kind].listed);

/** The kinds whose tenants the public counts count. */
export const countedTenantKinds = (): TenantKind[] => tenantKindValues.filter((kind) => appConfig.tenantKinds[kind].counted);

/**
 * Rejects when the tenant's hard cap on `key` would be passed. `existing` is the count the tenant holds
 * now, `adding` the rows about to be created. System admins bypass. Organizations keep a check of their own: the 1:1
 * slot binds system admins too and clamps a batch.
 * @throws AppError 403 `restrict_by_app` with the key in `meta.resource` and the cap in `meta.quota`; an entity key also
 * sets `entityType`.
 */
export const assertTenantQuota = (ctx: ActorContext, key: QuotaKey, existing: number, adding = 1): void => {
  const quota = ctx.var.tenant.restrictions.quotas[key];
  if (ctx.var.isSystemAdmin || withinCap(quota, existing + adding)) return;
  const entityType = appConfig.entityTypes.find((type) => type === key);
  throw new AppError(403, 'restrict_by_app', 'warn', { ...(entityType && { entityType }), meta: { resource: key, quota } });
};

/**
 * Rejects an invitation in a tenant whose kind invites no one (`appConfig.tenantKinds`): a demo mails no third party.
 * Binds system admins too, since the mail is the point.
 * @throws AppError 403 `restrict_by_tenant_kind` with the kind in `meta.kind`.
 */
export const assertTenantInvites = ({ kind }: { kind: TenantKind }): void => {
  if (appConfig.tenantKinds[kind].invitations) return;
  throw new AppError(403, 'restrict_by_tenant_kind', 'warn', { meta: { resource: 'invitation', kind } });
};

/**
 * Rejects sharing with the public in a tenant whose kind shares nothing (`appConfig.tenantKinds`): a demo hosts no page
 * for anyone. Binds system admins too. A public read filters on {@link publicSharingTenantKinds}.
 * @throws AppError 403 `restrict_by_tenant_kind` with the kind in `meta.kind`.
 * @public
 */
export const assertTenantPublicSharing = ({ kind }: { kind: TenantKind }): void => {
  if (appConfig.tenantKinds[kind].publicSharing) return;
  throw new AppError(403, 'restrict_by_tenant_kind', 'warn', { meta: { resource: 'public', kind } });
};

/** The kinds whose tenants share with the public: what a public read or a link preview serves content of. */
export const publicSharingTenantKinds = (): TenantKind[] => tenantKindValues.filter((kind) => appConfig.tenantKinds[kind].publicSharing);

/**
 * Whether a public read may serve the tenant's rows: active, not past its end and of a kind that shares with the
 * public. `publicGuard` runs no tenantGuard, so every public read decides this itself; {@link publiclyServedTenant} is
 * the same test in SQL.
 */
export const servesPublicly = (tenant: Pick<TenantModel, 'kind' | 'status' | 'expiresAt'>): boolean =>
  tenant.status === 'active' && (!tenant.expiresAt || tenant.expiresAt > getIsoDate()) && appConfig.tenantKinds[tenant.kind].publicSharing;

/** Stored restrictions laid over the current defaults: `{}` reads as the config, and a row gains the fields it predates or a patch removed. */
export const normalizeRestrictions = (stored?: MergePatch<Restrictions> | null): Restrictions => applyMergePatch(defaultRestrictions(), stored ?? {});
