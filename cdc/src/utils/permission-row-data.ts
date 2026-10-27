import { appConfig } from 'shared';
import type { CdcRowData, RowData } from '../types';

/** The columns of a product row that decide who may read it and where it is: all the API reads of a row from a message. */
const permissionRowKeys: Set<string> = (() => {
  const keys = new Set<string>(['id', 'createdBy', 'deletedAt', 'public', 'publishedAt']);
  for (const channelType of appConfig.channelEntityTypes) {
    keys.add(appConfig.entityIdColumnKeys[channelType]);
  }
  return keys;
})();

/** A row's permission columns and no content: a product row as a message carries it, and the place a moved row left. */
export function pickPermissionRowData(rowData: CdcRowData): CdcRowData {
  const slim: RowData = {};
  for (const [key, value] of Object.entries(rowData)) {
    if (permissionRowKeys.has(key)) slim[key] = value;
  }
  return slim as CdcRowData;
}
