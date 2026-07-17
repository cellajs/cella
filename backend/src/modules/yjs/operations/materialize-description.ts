import { eq } from 'drizzle-orm';
import { isProductEntity } from 'shared';
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
 * Persist a Yjs collab session's description to the entity's durable record,
 * on behalf of the last editing user. Called by the Yjs relay (secret-gated route).
 *
 * Synthesizes an AuthContext for the editing user and dispatches to the entity's
 * registered materializer, which runs the standard update pipeline: permission
 * re-check (defense in depth, the relay already verified, but access may have been
 * revoked mid-session), server-HLC stamping, derived-field computation, CDC/SSE.
 */
export async function materializeDescriptionOp(input: MaterializeDescriptionInput): Promise<{ sanitized: boolean }> {
  if (!isProductEntity(input.entityType)) {
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

  // Synthesized worker context, carries exactly what the update pipeline reads
  // (user, memberships, tenant/org scope, base db). Session-bound vars don't apply here.
  //
  // `isSystemAdmin: false` is deliberate and matches the relay's own check: collaborative
  // editing confers no system-admin bypass. The relay credits the window's last editor and
  // authorizes the persisted update as that user, not as an operator.
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

  await materializer(ctx, { entityId: input.entityId, description });
  return { sanitized };
}
