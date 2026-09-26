import { inArray } from 'drizzle-orm';
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
  /** Senders of the compacted log, newest first: the first who may still update the entity is credited with the write. */
  editors: string[];
}

/** `written` names the editor credited; `gone` means the entity no longer exists in the document's tenant. */
export type MaterializeDescriptionResult =
  | { outcome: 'written'; sanitized: boolean; editedBy: string }
  | { outcome: 'gone' };

/**
 * Persists a Yjs collab description; called by the Yjs relay on the internal listener. The tenant and organization come
 * from the entity row: a row missing from the named tenant is `gone`, and another organization is refused (403). The
 * write is credited to the newest editor who may still update the entity, through the entity's materializer, which
 * runs the normal update operation and its permission check. When no editor may, the write is refused (403) and the
 * relay keeps the edits.
 */
export async function materializeDescriptionOp(
  input: MaterializeDescriptionInput,
): Promise<MaterializeDescriptionResult> {
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
  if (!row || row.tenantId !== input.tenantId) return { outcome: 'gone' };
  if (row.organizationId !== input.organizationId) {
    throw new AppError(403, 'forbidden', 'warn', {
      entityType,
      meta: { reason: 'Organization does not match the entity' },
    });
  }

  const { description, sanitized, invalidUrls } = sanitizeBlockMediaUrls(input.description, {
    organizationId: row.organizationId,
  });
  if (sanitized) {
    log.warn('Yjs materialization sanitized untrusted media URLs', {
      entityType,
      entityId: input.entityId,
      invalidUrls,
    });
  }

  const [users, memberships] = await Promise.all([
    baseDb.select().from(usersTable).where(inArray(usersTable.id, input.editors)),
    baseDb.select().from(membershipsTable).where(inArray(membershipsTable.userId, input.editors)),
  ]);

  for (const editorId of input.editors) {
    const user = users.find((candidate) => candidate.id === editorId);
    if (!user) continue;
    const bindings = memberships.filter((membership) => membership.userId === editorId);

    // Worker context only: persist as this editor with no system-administrator bypass, matching relay authorization.
    const ctx = {
      var: {
        user,
        userId: user.id,
        actor: { kind: 'user', id: user.id, bindings, scopes: null },
        isSystemAdmin: false,
        memberships: bindings,
        db: baseDb,
        tenantId: row.tenantId,
        organizationId: row.organizationId,
      },
    } as unknown as UserContext;

    try {
      // Empty fieldTimestamps lets the pipeline stamp a fresh server HLC.
      await materializer(
        ctx,
        input.entityId,
        { ops: { description }, stx: { mutationId: uuidv7(), sourceId: 'yjs-relay', fieldTimestamps: {} } },
        { serverOrigin: true },
      );
      return { outcome: 'written', sanitized, editedBy: user.id };
    } catch (err) {
      // This editor may no longer update the row (or no longer see it, as with another author's draft): try the next.
      if (err instanceof AppError && (err.status === 403 || err.status === 404)) continue;
      throw err;
    }
  }

  throw new AppError(403, 'forbidden', 'warn', {
    entityType,
    meta: { reason: 'No editor in the log may still update the entity' },
  });
}
