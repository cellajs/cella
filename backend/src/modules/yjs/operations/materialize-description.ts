import { isProduct } from 'shared';
import { uuidv7 } from 'uuidv7';
import { AppError } from '#/core/error';
import { baseDb } from '#/db/db';
import { tenantReadById } from '#/db/tenant-context';
import { resolveEntity } from '#/modules/entities/entities-queries';
import { findMembershipsByUserIds } from '#/modules/memberships/memberships-queries';
import { withOrganizationDefaults } from '#/modules/organization/helpers/select';
import { loadTenant } from '#/modules/tenants/load-tenant';
import { findUserModelsByIds } from '#/modules/user/user-queries';
import { yjsMaterializeWindow } from '#/modules/yjs/helpers/materialize-window';
import { sanitizeBlockMediaUrls } from '#/modules/yjs/helpers/sanitize-block-media';
import { getYjsMaterializer, type YjsMaterializerContext } from '#/modules/yjs/yjs-materializers';
import { log } from '#/utils/logger';

/** The editors, the tenant and the organization are read on the base pool: the relay calls without a request context. */
const dbCtx = { var: { db: baseDb } };

interface MaterializeDescriptionInput {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
  description: string;
  /** Senders of the compacted log, newest first: the first who may still update the entity is credited with the write. */
  editors: string[];
  /**
   * The server-origin log rows (no sender) merged into `description`, none when absent; another server row of the
   * document refuses the write (409).
   */
  serverRowIds?: readonly number[];
}

/** The description is stored; `sanitized` when media URLs were blanked. */
interface MaterializeDescriptionResult {
  sanitized: boolean;
}

/**
 * Persists a Yjs collab description; called by the Yjs relay on the internal listener. The tenant and organization come
 * from the entity row: a row missing from the named tenant is gone (410, so the relay deletes the document's rows),
 * and another organization is refused (403). The write is credited to the newest editor who may still update the
 * entity, through the entity's materializer, which runs the normal update operation and its permission check. When
 * no editor may, the write is refused (403) and the relay keeps the edits. A server-origin row of the document's log
 * outside `serverRowIds` is an outside write committed after the relay read its window: the write is refused (409), so
 * it never overwrites that write, and the relay retries with a window that holds it.
 */
export async function materializeDescriptionOp(input: MaterializeDescriptionInput): Promise<MaterializeDescriptionResult> {
  const { entityType } = input;
  if (!isProduct(entityType)) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: `Unknown entity type: ${entityType}` } });
  }

  const materializer = getYjsMaterializer(entityType);
  if (!materializer) {
    throw new AppError(400, 'invalid_request', 'warn', { meta: { reason: `No Yjs materializer registered for ${entityType}` } });
  }

  const gone = () => new AppError(410, 'not_found', 'warn', { entityType, meta: { reason: 'The entity is gone' } });
  const row = await tenantReadById(input.tenantId, (tx) => resolveEntity({ var: { db: tx } }, { entityType, identifier: input.entityId }));
  if (!row || row.tenantId !== input.tenantId) throw gone();
  if (row.organizationId !== input.organizationId) {
    throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { reason: 'Organization does not match the entity' } });
  }

  const { description, sanitized, invalidUrls } = sanitizeBlockMediaUrls(input.description, { organizationId: row.organizationId });
  if (sanitized) {
    log.warn('Yjs materialization sanitized untrusted media URLs', { entityType, entityId: input.entityId, invalidUrls });
  }

  const [users, memberships, tenant, organization] = await Promise.all([
    findUserModelsByIds(dbCtx, { ids: input.editors }),
    findMembershipsByUserIds(dbCtx, { userIds: input.editors }),
    loadTenant(row.tenantId),
    resolveEntity(dbCtx, { entityType: 'organization', identifier: row.organizationId }),
  ]);
  // The entity row's foreign keys hold both, so a miss is a tenant removed since that read.
  if (!tenant || !organization) throw gone();

  for (const editorId of input.editors) {
    const user = users.find((candidate) => candidate.id === editorId);
    if (!user) continue;
    const bindings = memberships.filter((membership) => membership.userId === editorId);
    const membership = bindings.find((binding) => binding.organizationId === organization.id && binding.channelType === 'organization') ?? null;

    // This editor in the organization, as the guards set a request's context, with no system-administrator bypass,
    // matching relay authorization.
    const ctx: YjsMaterializerContext = {
      var: {
        user,
        actor: { kind: 'user', id: user.id, bindings, scopes: null },
        isSystemAdmin: false,
        db: baseDb,
        tenantId: row.tenantId,
        tenant,
        organizationId: organization.id,
        organization: { ...withOrganizationDefaults(organization), membership },
      },
    };

    try {
      // Empty fieldTimestamps lets the pipeline stamp a fresh server HLC. The window reaches the yjs module's
      // `<type>.updated` handler, which checks it under the entity row lock.
      await yjsMaterializeWindow.run({ entityId: input.entityId, serverRowIds: input.serverRowIds ?? [] }, () =>
        materializer(
          ctx,
          input.entityId,
          { ops: { description }, stx: { mutationId: uuidv7(), sourceId: 'yjs-relay', fieldTimestamps: {} } },
          { serverOrigin: true, materialized: true },
        ),
      );
      return { sanitized };
    } catch (err) {
      // This editor may not update the row now, or not see it (another author's draft): try the next.
      if (err instanceof AppError && (err.status === 403 || err.status === 404)) continue;
      throw err;
    }
  }

  throw new AppError(403, 'forbidden', 'warn', { entityType, meta: { reason: 'No editor in the log may still update the entity' } });
}
