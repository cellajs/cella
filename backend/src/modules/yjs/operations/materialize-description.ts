import { eq } from 'drizzle-orm';
import { isProduct } from 'shared';
import { uuidv7 } from 'uuidv7';
import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { usersTable } from '#/modules/user/user-db';
import { sanitizeBlockMediaUrls } from '#/modules/yjs/helpers/sanitize-block-media';
import { getYjsMaterializer } from '#/modules/yjs/yjs-materializers';
import { log } from '#/utils/logger';

export interface MaterializeDescriptionInput {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
  description: string;
  /** Last editor whose update was in the compacted log; becomes `updatedBy` and the permission subject. */
  editedBy: string;
}

/**
 * Persists a Yjs collab description on behalf of the last editing user; called by the Yjs relay.
 * The tenant and organization come from the entity row: a body naming another scope is refused
 * (404 outside the named tenant, 403 for another organization). Dispatches to the entity's
 * materializer, which re-checks permission in that scope because access may be revoked mid-session.
 */
export async function materializeDescriptionOp(input: MaterializeDescriptionInput): Promise<{ sanitized: boolean }> {
  const { entityType } = input;
  if (!isProduct(entityType)) {
    throw new AppError(400, 'invalid_request', 'warn', {
      meta: { reason: `Unknown entity type: ${entityType}` },
    });
  }

  const materializer = getYjsMaterializer(entityType);
  if (!materializer) {
    throw new AppError(400, 'invalid_request', 'warn', {
      meta: { reason: `No Yjs materializer registered for ${entityType}` },
    });
  }

  const row = await tenantReadById(input.tenantId, (tx) =>
    resolveEntity({ var: { db: tx } }, { entityType, identifier: input.entityId }),
  );
  if (!row || row.tenantId !== input.tenantId) throw new AppError(404, 'not_found', 'warn', { entityType });
  if (row.organizationId !== input.organizationId) {
    throw new AppError(403, 'forbidden', 'warn', {
      entityType,
      meta: { reason: 'Organization does not match the entity' },
    });
  }

  const [user] = await baseDb.select().from(usersTable).where(eq(usersTable.id, input.editedBy)).limit(1);
  if (!user) throw new AppError(404, 'not_found', 'warn', { meta: { reason: 'Editing user not found' } });

  const memberships = await baseDb.select().from(membershipsTable).where(eq(membershipsTable.userId, user.id));

  // Worker context only: persist as the last editor with no system-administrator bypass, matching relay authorization.
  const ctx = {
    var: {
      user,
      userId: user.id,
      actor: { kind: 'user', id: user.id, bindings: memberships, scopes: null },
      isSystemAdmin: false,
      memberships,
      db: baseDb,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
    },
  } as unknown as UserContext;

  const { description, sanitized, invalidUrls } = sanitizeBlockMediaUrls(input.description);
  if (sanitized) {
    log.warn('Yjs materialization sanitized untrusted media URLs', {
      entityType,
      entityId: input.entityId,
      invalidUrls,
    });
  }

  // Empty fieldTimestamps lets the pipeline stamp a fresh server HLC.
  await materializer(
    ctx,
    input.entityId,
    { ops: { description }, stx: { mutationId: uuidv7(), sourceId: 'yjs-relay', fieldTimestamps: {} } },
    { serverOrigin: true },
  );
  return { sanitized };
}
