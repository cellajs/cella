import type { YjsDocKey, YjsDocScope } from 'shared';
import { stateToBlocksJson } from '#/modules/yjs/helpers/description-update';
import type { YjsMaterializeRequest } from '#/modules/yjs/yjs-schema';
import { docKey } from '../constants';
import { env } from '../env';
import { log } from '../lib/pino';

/**
 * Outcome of one materialize attempt. Only `ok` lets compaction fold the log into the base.
 * - `ok`: durable, safe to compact.
 * - `gone` (410): the entity no longer exists in the document's tenant; nothing can receive the
 *   log, so a finish and the sweep delete the document's rows.
 * - `retry`: the backend is unavailable or refused this write; the log stays, so the next window,
 *   the finish or the sweep tries again.
 */
export type MaterializeResult = 'ok' | 'gone' | 'retry';

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
      } satisfies YjsMaterializeRequest),
      signal: AbortSignal.timeout(materializeTimeoutMs),
    });
    if (res.ok) return 'ok';
    if (res.status === 410) {
      log.warn(`Materialize: ${docKey(scope)} no longer exists, dropping its log`);
      return 'gone';
    }

    log.warn(`Materialize refused for ${docKey(scope)}`, { status: res.status });
    return 'retry';
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
