import { appConfig } from 'shared';
import type { CdcRowData } from '../types';

/** Fields carried for per-subscriber SSE visibility checks; content never belongs in batch metadata. */
const permissionRowKeys: Set<string> = (() => {
  const keys = new Set<string>(['id', 'createdBy', 'deletedAt', 'publicAt', 'publishedAt']);
  for (const channelType of appConfig.channelEntityTypes) {
    keys.add(appConfig.entityIdColumnKeys[channelType]);
  }
  return keys;
})();

/** Null-safe passthrough. */
export function pickPermissionRowData(rowData: CdcRowData | null | undefined): CdcRowData | null {
  if (!rowData) return null;
  const slim: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (permissionRowKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
