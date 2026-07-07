import type { DocContext } from '../constants';
import { pool, withClient } from './db';

/** 
 * Returns raw Y.Doc binary state from PG, or null if no document exists yet.
 */
export async function loadState({ entityType, entityId, tenantId, userId }: DocContext): Promise<Uint8Array | null> {
  return withClient(tenantId, userId, async (client) => {
    const result = await client.query('SELECT state FROM yjs_documents WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
    if (result.rows.length === 0) return null;
    return new Uint8Array(result.rows[0].state);
  });
}

/**
 * Overwrites the stored Y.Doc state. Called on debounced flush from the relay.
 * `lastEditedBy` records the last writer for materialization attribution — it lets
 * the startup sweep persist crash-orphaned sessions on behalf of the right user.
 */
export async function saveState(
  { entityType, entityId, tenantId, userId }: DocContext,
  state: Uint8Array,
  lastEditedBy: string | null = null,
): Promise<void> {
  await withClient(tenantId, userId, async (client) => {
    await client.query(
      `UPDATE yjs_documents SET state = $1, last_edited_by = $4, updated_at = now()
       WHERE entity_type = $2 AND entity_id = $3`,
      [Buffer.from(state), entityType, entityId, lastEditedBy],
    );
  });
}

/**
 * Inserts a document row on first connection, optionally with a server-side seed
 * as its initial state. No-ops if it already exists — concurrent connectors must
 * re-load afterwards and use the canonical row (two independently generated seeds
 * would duplicate content when merged).
 */
export async function createDoc(
  { entityType, entityId, tenantId, userId, organizationId }: DocContext,
  initialState?: Uint8Array | null,
): Promise<void> {
  await withClient(tenantId, userId, async (client) => {
    await client.query(
      `INSERT INTO yjs_documents (entity_type, entity_id, tenant_id, organization_id, state, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (entity_type, entity_id) DO NOTHING`,
      [entityType, entityId, tenantId, organizationId, initialState ? Buffer.from(initialState) : Buffer.alloc(0)],
    );
  });
}

/**
 * Removes the document row after the cleanup grace period (all clients disconnected).
 */
export async function deleteState({ entityType, entityId, tenantId, userId }: DocContext): Promise<void> {
  await withClient(tenantId, userId, async (client) => {
    await client.query('DELETE FROM yjs_documents WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
  });
}

export interface StaleDocRow {
  entityType: string;
  entityId: string;
  tenantId: string;
  organizationId: string | null;
  state: Uint8Array;
  lastEditedBy: string | null;
}

/**
 * List document rows untouched for longer than the cleanup grace — orphans left by a
 * relay crash between last-disconnect and cleanup. Cross-tenant by design, so this runs
 * on the pool directly (no tenant context). If the DB role enforces RLS it returns no
 * rows and the sweep degrades to a no-op — normal gated cleanup is unaffected.
 */
export async function listStaleDocs(olderThanMs: number): Promise<StaleDocRow[]> {
  const result = await pool.query(
    `SELECT entity_type, entity_id, tenant_id, organization_id, state, last_edited_by
     FROM yjs_documents
     WHERE updated_at < now() - ($1::bigint * interval '1 millisecond')`,
    [olderThanMs],
  );
  return result.rows.map((row) => ({
    entityType: row.entity_type,
    entityId: row.entity_id,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    state: new Uint8Array(row.state),
    lastEditedBy: row.last_edited_by,
  }));
}

/** Delete a swept orphan row (pool-direct — same cross-tenant caveat as {@link listStaleDocs}). */
export async function deleteStaleDoc(entityType: string, entityId: string): Promise<void> {
  await pool.query('DELETE FROM yjs_documents WHERE entity_type = $1 AND entity_id = $2', [entityType, entityId]);
}
