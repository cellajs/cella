import { eq } from 'drizzle-orm';
import { isProduct } from 'shared';
import { uuidv7 } from 'uuidv7';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
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
  /** Last editor in the relay's save window, becomes `updatedBy` and the permission subject. */
  editedBy: string;
}

/**
 * Persists a Yjs collab description on behalf of the last editing user; called by the Yjs relay.
 * Dispatches to the entity's materializer, which re-checks permission because access may be revoked mid-session.
 */
export async function materializeDescriptionOp(input: MaterializeDescriptionInput): Promise<{ sanitized: boolean }> {
  if (!isProduct(input.entityType)) {
    throw new AppError(400, 'invalid_request', 'warn', {
      meta: { reason: `Unknown entity type: ${input.entityType}` },
    });
  }

  const materializer = getYjsMaterializer(input.entityType);
  if (!materializer) {
    throw new AppError(400, 'invalid_request', 'warn', {
      meta: { reason: `No Yjs materializer registered for ${input.entityType}` },
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
      isSystemAdmin: false,
      memberships,
      db: baseDb,
      tenantId: input.tenantId,
      organizationId: input.organizationId ?? undefined,
    },
  } as unknown as AuthContext;

  const { description, sanitized, invalidUrls } = sanitizeBlockMediaUrls(input.description);
  if (sanitized) {
    log.warn('Yjs materialization sanitized untrusted media URLs', {
      entityType: input.entityType,
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
