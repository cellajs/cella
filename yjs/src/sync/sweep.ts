import { YJS_CLEANUP_DELAY_MS } from '../constants';
import { deleteStaleDoc, listStaleDocs } from '../data/storage';
import { log } from '../lib/pino';
import { postMaterialize, stateToBlocksJson } from './materialize';

/**
 * Recovers stale relay sessions on startup, persisting edited Y.Doc state before deletion.
 * Unedited rows delete directly; retryable failures remain for a later boot or session.
 * Concurrent durable writes converge through server-side HLC resolution.
 */
export async function runStartupSweep(): Promise<void> {
  let stale: Awaited<ReturnType<typeof listStaleDocs>>;
  try {
    stale = await listStaleDocs(YJS_CLEANUP_DELAY_MS);
  } catch (err) {
    log.warn('Startup sweep: listing stale docs failed', { err });
    return;
  }
  if (stale.length === 0) return;

  log.info(`Startup sweep: found ${stale.length} orphaned session row(s)`);

  for (const doc of stale) {
    const ctx = {
      entityType: doc.entityType,
      entityId: doc.entityId,
      tenantId: doc.tenantId,
      userId: doc.lastEditedBy ?? '',
      organizationId: doc.organizationId,
      verified: true,
    };

    if (doc.lastEditedBy && doc.state.length > 0) {
      const json = stateToBlocksJson(doc.state);
      if (json !== null) {
        const result = await postMaterialize(ctx, doc.lastEditedBy, json);
        if (result === 'retry') {
          log.warn(`Startup sweep: materialize unavailable for ${doc.entityType}:${doc.entityId} — keeping row`);
          continue;
        }
      }
    }

    try {
      await deleteStaleDoc(doc.entityType, doc.entityId);
    } catch (err) {
      log.warn(`Startup sweep: failed to delete ${doc.entityType}:${doc.entityId}`, { err });
    }
  }
}
