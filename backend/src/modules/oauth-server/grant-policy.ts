import { and, eq } from 'drizzle-orm';
import { baseDb } from '#/db/db';
import { findTenantById } from '#/db/prepared';
import { getTenantCache } from '#/middlewares/guard/tenant-cache';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { oauthClientsTable } from '#/modules/oauth-server/oauth-clients-db';
import { apiKeysTable } from '#/modules/service-accounts/api-keys-db';
import { serviceAccountsTable } from '#/modules/service-accounts/service-accounts-db';
import { normalizeRestrictions } from '#/modules/tenants/tenant-restrictions';
import { usersTable } from '#/modules/user/user-db';
import { isExpiredDate } from '#/utils/is-expired-date';

/** A person's consent to a client, for one tenant's resource. */
export interface UserGrantSubject {
  kind: 'user';
  userId: string;
  clientId: string;
  tenantId: string;
}

/** A service account's own token (`client_credentials`) and the API key it was minted with. */
export interface ServiceGrantSubject {
  kind: 'service';
  serviceAccountId: string;
  keyId: string;
}

export type UserGrantRefusal =
  | 'unknown_user'
  | 'not_a_member'
  | 'app_not_installed'
  | 'unregistered_clients_not_allowed';
export type ServiceGrantRefusal = 'invalid_api_key' | 'service_account_disabled';
export type GrantRefusal = UserGrantRefusal | ServiceGrantRefusal;

/**
 * Whether a grant still holds: null while it does, else why not. Consent asks before the grant exists, the token
 * endpoint at every code exchange and refresh, and the guards for every access token, so a grant ends as soon as
 * what it rests on does.
 * - A person's grant needs the user, a membership in the resource's tenant and, per client, an active installation in
 *   that tenant (a registered app) or the tenant's consent to unregistered clients (a client whose id is the URL of
 *   its metadata document).
 * - A service account's token needs the API key it was minted with to be live, and the account to be active.
 * @param subject - Whose grant, for which client and tenant, or which account and key.
 * @returns The refusal, or null while the grant holds.
 */
export function grantRefusal(subject: UserGrantSubject): Promise<UserGrantRefusal | null>;
export function grantRefusal(subject: ServiceGrantSubject): Promise<ServiceGrantRefusal | null>;
export function grantRefusal(subject: UserGrantSubject | ServiceGrantSubject): Promise<GrantRefusal | null> {
  return subject.kind === 'user' ? userGrantRefusal(subject) : serviceGrantRefusal(subject);
}

async function userGrantRefusal({ userId, clientId, tenantId }: UserGrantSubject): Promise<UserGrantRefusal | null> {
  // The users row, not the actors row: an actor outlives its user.
  const [person] = await baseDb
    .select({ membershipId: membershipsTable.id })
    .from(usersTable)
    .leftJoin(
      membershipsTable,
      and(eq(membershipsTable.userId, usersTable.id), eq(membershipsTable.tenantId, tenantId)),
    )
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!person) return 'unknown_user';
  if (!person.membershipId) return 'not_a_member';

  const [app] = await baseDb
    .select({ installationId: serviceAccountsTable.id })
    .from(oauthClientsTable)
    .leftJoin(
      serviceAccountsTable,
      and(
        eq(serviceAccountsTable.oauthClientId, oauthClientsTable.id),
        eq(serviceAccountsTable.tenantId, tenantId),
        eq(serviceAccountsTable.status, 'active'),
      ),
    )
    .where(eq(oauthClientsTable.id, clientId))
    .limit(1);
  if (app) return app.installationId ? null : 'app_not_installed';

  // Any other id that is not a metadata document URL belonged to a registered app whose row is gone.
  if (!/^https:\/\//i.test(clientId)) return 'app_not_installed';
  return (await allowsUnregisteredClients(tenantId)) ? null : 'unregistered_clients_not_allowed';
}

/**
 * The tenant's stored restriction, whatever its status: `tenantGuard` refuses a suspended tenant at use, and a grant
 * deleted over a suspension would stay gone after it is lifted.
 */
async function allowsUnregisteredClients(tenantId: string): Promise<boolean> {
  const tenant = getTenantCache(tenantId) ?? (await findTenantById.execute({ id: tenantId }))[0];
  return !!tenant && normalizeRestrictions(tenant.restrictions).allowUnregisteredClients;
}

async function serviceGrantRefusal({
  serviceAccountId,
  keyId,
}: ServiceGrantSubject): Promise<ServiceGrantRefusal | null> {
  const [key] = await baseDb
    .select({
      revokedAt: apiKeysTable.revokedAt,
      expiresAt: apiKeysTable.expiresAt,
      status: serviceAccountsTable.status,
    })
    .from(apiKeysTable)
    .innerJoin(serviceAccountsTable, eq(serviceAccountsTable.id, apiKeysTable.actorId))
    .where(and(eq(apiKeysTable.id, keyId), eq(apiKeysTable.actorId, serviceAccountId)))
    .limit(1);
  if (!key || key.revokedAt || (key.expiresAt && isExpiredDate(key.expiresAt))) return 'invalid_api_key';
  return key.status === 'active' ? null : 'service_account_disabled';
}
