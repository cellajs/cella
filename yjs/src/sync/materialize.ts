import { appConfig } from 'shared';
import type { DocContext } from '../constants';
import { env } from '../env';
import { yUpdateToBlocks } from '../lib/blocknote-seed';
import { log } from '../lib/pino';

/**
 * `ok`: persisted, or content unchanged.
 * `permanent`: backend rejected it (4xx). Do not retry the same content; cleanup may proceed.
 * `retry`: backend unavailable (5xx or fetch error). Cleanup must keep the session row.
 */
export type MaterializeResult = 'ok' | 'permanent' | 'retry';

/** Minimal session shape read and updated by materializeState; matches CollabSession. */
export interface MaterializableSession {
  ctx: DocContext;
  lastMaterializedJson?: string;
  lastEditor?: DocContext;
}

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

/** Compares blocks JSON with `lastMaterializedJson` to skip unchanged save windows; on `retry` the stored JSON is left unchanged so the next window tries again. */
export async function materializeState(collab: MaterializableSession, state: Uint8Array): Promise<MaterializeResult> {
  const json = stateToBlocksJson(state);
  // Unparseable state can never converge, so cleanup is not blocked on it.
  if (json === null) return 'permanent';

  if (json === collab.lastMaterializedJson) return 'ok';

  const editedBy = collab.lastEditor?.userId ?? collab.ctx.userId;
  const result = await postMaterialize(collab.ctx, editedBy, json);
  if (result !== 'retry') collab.lastMaterializedJson = json;
  return result;
}
