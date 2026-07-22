import { appConfig } from 'shared';
import type { CdcRowData } from '../types';

/**
 * Permission-only row fields carried for per-subscriber SSE visibility checks.
 * Fork-specific permission inputs must be added here; content never belongs in batch metadata.
 */
const permissionRowKeys: Set<string> = (() => {
  const keys = new Set<string>(['id', 'createdBy', 'deletedAt', 'publicAt', 'publishedAt', 'path']);
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
