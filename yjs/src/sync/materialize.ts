import type { DocScope } from '../constants';
import { env } from '../env';
import { yUpdateToBlocks } from '../lib/blocknote-seed';
import { log } from '../lib/pino';

/**
 * Outcome of one materialize attempt. Only `ok` lets compaction fold the log into the base.
 * - `ok`: durable, safe to compact.
 * - `permanent`: the backend rejected the request itself (a 4xx no later attempt changes: an
 *   invalid body, an unknown type, no materializer); the log stays and cleanup stops retrying.
 * - `retry`: the backend is unavailable, or refused this write for a reason that can change (a
 *   rotated secret, an editor who lost access, an entity outside the claimed scope); the log stays
 *   so the next window, cleanup or sweep tries again.
 */
export type MaterializeResult = 'ok' | 'permanent' | 'retry';

/** Refusals a later attempt can overcome, so they never count as permanent. */
const retryableStatuses: ReadonlySet<number> = new Set([401, 403, 404, 408, 409, 429]);

/** POST blocks JSON to the materialize route on the backend's internal listener, authenticated by the relay secret. */
export async function postMaterialize(
  scope: DocScope,
  editedBy: string,
  description: string,
): Promise<MaterializeResult> {
  try {
    const res = await fetch(`${env.BACKEND_INTERNAL_URL}/internal/yjs/materialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-yjs-relay-secret': env.YJS_RELAY_SECRET },
      body: JSON.stringify({
        entityType: scope.entityType,
        entityId: scope.entityId,
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        editedBy,
        description,
      }),
    });
    if (res.ok) return 'ok';

    const rejected = res.status >= 400 && res.status < 500 && !retryableStatuses.has(res.status);
    const kind: MaterializeResult = rejected ? 'permanent' : 'retry';
    log.warn(`Materialize ${kind} failure for ${scope.entityType}:${scope.entityId}`, { status: res.status });
    return kind;
  } catch (err) {
    log.warn(`Materialize unreachable for ${scope.entityType}:${scope.entityId}`, { err });
    return 'retry';
  }
}

/** Convert a Y.Doc state to blocks JSON; null when the state can't be parsed. */
export function stateToBlocksJson(state: Uint8Array): string | null {
  try {
    return JSON.stringify(yUpdateToBlocks(state));
  } catch (err) {
    log.error('Failed to convert Y.Doc state to blocks', { err });
    return null;
  }
}
