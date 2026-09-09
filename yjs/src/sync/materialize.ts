import { appConfig } from 'shared';
import type { DocContext } from '../constants';
import { env } from '../env';
import { yUpdateToBlocks } from '../lib/blocknote-seed';
import { log } from '../lib/pino';

/**
 * Outcome of one materialize attempt.
 * - `ok`: durable, safe to compact.
 * - `permanent`: the backend refused (4xx: entity gone, access revoked, no materializer); retrying
 *   cannot converge, so the log compacts without a re-post.
 * - `retry`: backend unavailable; the log stays so the next window, cleanup or sweep tries again.
 */
export type MaterializeResult = 'ok' | 'permanent' | 'retry';

/** POST blocks JSON to the backend's secret-gated materialize endpoint. */
export async function postMaterialize(
  ctx: DocContext,
  editedBy: string,
  description: string,
): Promise<MaterializeResult> {
  try {
    const res = await fetch(`${appConfig.backendUrl}/yjs/materialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-yjs-secret': env.YJS_SECRET },
      body: JSON.stringify({
        entityType: ctx.entityType,
        entityId: ctx.entityId,
        tenantId: ctx.tenantId,
        organizationId: ctx.organizationId,
        editedBy,
        description,
      }),
    });
    if (res.ok) return 'ok';

    const kind: MaterializeResult = res.status >= 400 && res.status < 500 ? 'permanent' : 'retry';
    log.warn(`Materialize ${kind} failure for ${ctx.entityType}:${ctx.entityId}`, { status: res.status });
    return kind;
  } catch (err) {
    log.warn(`Materialize unreachable for ${ctx.entityType}:${ctx.entityId}`, { err });
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
