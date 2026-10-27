import { stateToBlocksJson } from '#/modules/yjs/helpers/description-update';
import type { YjsDocKey, YjsDocScope } from '#/modules/yjs/helpers/yjs-log';
import { docKey } from '../constants';
import { env } from '../env';
import { log } from '../lib/pino';

/**
 * Outcome of one materialize attempt. Only `ok` lets compaction fold the log into the base.
 * - `ok`: durable, safe to compact.
 * - `gone` (410): the entity no longer exists in the document's tenant; nothing can receive the
 *   log, so cleanup and sweep delete the document's rows.
 * - `permanent`: the backend rejected the request itself (a 4xx no later attempt changes: an
 *   invalid body, an unknown type, no materializer); the log stays and cleanup stops retrying.
 * - `retry`: the backend is unavailable, or refused this write for a reason that can change (a
 *   rotated secret, no editor in the window who may still update the entity, an outside write the
 *   merge lacks); the log stays so the next window, cleanup or sweep tries again.
 */
export type MaterializeResult = 'ok' | 'gone' | 'permanent' | 'retry';

/** Refusals a later attempt can overcome, so they never count as permanent. */
const retryableStatuses: ReadonlySet<number> = new Set([401, 403, 404, 408, 409, 429]);

/** How long a materialize request may take before it counts as a retry: the caller holds the document lock. */
const materializeTimeoutMs = 10_000;

/**
 * POST blocks JSON to the materialize route on the backend's internal listener, authenticated by the relay secret.
 * `editors` are the window's senders, newest first; `serverRowIds` the server-origin rows its merge holds, none
 * usually. The backend answers 409 when the log holds a server row the merge lacks: a retry.
 */
export async function postMaterialize(
  scope: YjsDocScope,
  editors: string[],
  description: string,
  serverRowIds: number[],
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
        editors,
        serverRowIds,
        description,
      }),
      signal: AbortSignal.timeout(materializeTimeoutMs),
    });
    if (res.ok) return 'ok';
    if (res.status === 410) {
      log.warn(`Materialize: ${docKey(scope)} no longer exists, dropping its log`);
      return 'gone';
    }

    const rejected = res.status >= 400 && res.status < 500 && !retryableStatuses.has(res.status);
    const kind: MaterializeResult = rejected ? 'permanent' : 'retry';
    log.warn(`Materialize ${kind} failure for ${docKey(scope)}`, { status: res.status });
    return kind;
  } catch (err) {
    log.warn(`Materialize unreachable for ${docKey(scope)}`, { err });
    return 'retry';
  }
}

/** Converts a Y.Doc state to blocks JSON with the backend's headless converter; null, logged with `doc`, when it can't be parsed. */
export function stateToBlocksJsonOrNull(state: Uint8Array, doc: YjsDocKey): string | null {
  try {
    return stateToBlocksJson(state);
  } catch (err) {
    log.error(`Compaction: unparseable state for ${docKey(doc)}, keeping the log`, { err });
    return null;
  }
}
