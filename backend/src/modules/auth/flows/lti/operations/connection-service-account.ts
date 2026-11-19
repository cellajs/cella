import { hierarchy } from 'shared';
import type { DbContext } from '#/core/context';
import { AppError } from '#/core/error';
import type { ServiceAccountId } from '#/db/utils/ids';
import type { LtiConnection } from '#/modules/connections/connections-db';
import { lockConnection } from '#/modules/connections/connections-queries';
import { findOrganizationByTenant } from '#/modules/organization/organization-queries';
import { findConnectionServiceAccountId, insertServiceAccount } from '#/modules/service-accounts/service-accounts-queries';
import { log } from '#/utils/logger';

/**
 * The id of the service account an LTI connection writes as, such as its member imports: made at its first use, at the
 * organization's least privileged role. The connection's row stays locked while the account is looked up and made:
 * two imports at once make one.
 * @throws AppError 404 `not_found` (`entityType: 'organization'`) for a tenant that holds no organization.
 */
export const connectionServiceAccountId = (ctx: DbContext, connection: LtiConnection): Promise<ServiceAccountId> =>
  ctx.var.db.transaction(async (tx) => {
    const txCtx = { var: { db: tx } };
    await lockConnection(txCtx, { id: connection.id });
    const held = await findConnectionServiceAccountId(txCtx, { connectionId: connection.id });
    if (held) return held;

    const organization = await findOrganizationByTenant(txCtx, { tenantId: connection.tenantId });
    if (!organization) throw new AppError(404, 'not_found', 'warn', { entityType: 'organization' });
    const role = hierarchy.getLeastPrivilegedRole('organization');
    const account = await insertServiceAccount(txCtx, {
      values: {
        tenantId: connection.tenantId,
        name: connection.name,
        bindings: [{ channelType: 'organization', channelId: organization.id, organizationId: organization.id, role }],
        connectionId: connection.id,
        createdBy: connection.createdBy,
      },
    });
    log.info('LTI connection service account created', { serviceAccountId: account.id, connectionId: connection.id });
    return account.id;
  });
