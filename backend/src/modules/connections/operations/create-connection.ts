import type { z } from '@hono/zod-openapi';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { withActorRef } from '#/modules/actors/actor-refs';
import { isFederationConfigured } from '#/modules/auth/sso/helpers/federations';
import { insertConnection } from '#/modules/connections/connections-queries';
import type { createConnectionBodySchema } from '#/modules/connections/connections-schema';
import { assertClaimValuesFree } from '#/modules/connections/operations/assert-claim-values-free';
import { log } from '#/utils/logger';

type CreateConnectionInput = z.infer<typeof createConnectionBodySchema>;

/**
 * Connects an institution to the tenant. The federation must be one this deployment holds a client for, and a domain
 * names one institution, so no other connection of the federation may already accept one of the values.
 * @throws AppError 400 `sso_not_configured` without the federation's client secret, 409 `resource_already_exists`
 *   when a domain is taken or the tenant already has an SSO connection.
 */
export async function createConnectionOp(ctx: UserContext, input: CreateConnectionInput) {
  const { issuer, displayName, claimValues, idpEntityIds, status, jitProvisioning, logoUrl } = input;

  if (!isFederationConfigured(issuer)) throw new AppError(400, 'sso_not_configured', 'error', { meta: { strategy: issuer } });
  await assertClaimValuesFree(ctx, { issuer, claimValues });

  const connection = await insertConnection(ctx, {
    values: {
      tenantId: ctx.var.tenantId,
      kind: 'sso',
      issuer,
      displayName,
      claimValues,
      status,
      jitProvisioning,
      config: { idpEntityIds, ...(logoUrl ? { logoUrl } : {}) },
      createdBy: ctx.var.actor.id,
    },
  });

  log.info('Connection created', { connectionId: connection.id, tenantId: connection.tenantId, issuer });

  return withActorRef(ctx, connection);
}
