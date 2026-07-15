import { appConfig } from 'shared';
import type { CdcRowData } from '../types';

/**
 * Row columns the API's SSE dispatch needs to evaluate read visibility per subscriber
 * ("SSE mirrors the API"): identity/audit basics, every context id column, and the
 * public marker (`publicAt`, read by `publicRead` grants).
 *
 * Forks that evaluate extra row fields at dispatch — custom row conditions or product
 * rules in `canReceiveEntityEvent` (e.g. an author-only `draft` column) — must add
 * those columns to the base list here so batch rows carry them on the wire.
 *
 * Used to slim per-row batch data on the wire — permission evaluation only, never content.
 */
const permissionRowKeys: Set<string> = (() => {
  const keys = new Set<string>(['id', 'createdBy', 'deletedAt', 'publicAt']);
  for (const channelType of appConfig.channelEntityTypes) {
    keys.add(appConfig.entityIdColumnKeys[channelType]);
  }
  return keys;
})();

/** Pick the permission-relevant subset of a row (null-safe passthrough). */
export function pickPermissionRowData(rowData: CdcRowData | null | undefined): CdcRowData | null {
  if (!rowData) return null;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (permissionRowKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
