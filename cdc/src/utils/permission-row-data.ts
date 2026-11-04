import { type PermissionRowData, permissionRowDataSchema } from 'shared/permissions/permission-row-data';
import type { CdcRowData, RowData } from '../types';

/** The schema's keys, as a set for the lookup per column. */
const permissionRowKeys: ReadonlySet<string> = new Set(Object.keys(permissionRowDataSchema.shape));

/** A row's permission columns and no content: a product row as a message carries it, and the place a moved row left. */
export function pickPermissionRowData(rowData: CdcRowData): PermissionRowData {
  const slim: RowData = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (permissionRowKeys.has(key)) slim[key] = value;
  }
  // The row image holds these columns as the schema types them once sent: a timestamp is a Date until the JSON makes it text.
  return slim as PermissionRowData;
}
