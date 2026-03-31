export { actionToVerb } from './action-to-verb';
export { convertRowKeys, type RowData, type CdcRowData } from './convert-row-keys';
export { extractRowData } from './extract-row-data';
export { extractStxData } from './extract-stx-data';
export { getChangedFields } from './get-changed-fields';
export { compactRowData, excludedRowDataKeys } from './compact-row-data';
export { computeUnifiedDeltas, computeBatchUnifiedDeltas } from './compute-unified-deltas';
export { applyUnifiedDeltas, applyBatchUnifiedDeltas } from './apply-unified-deltas';
export { getCountDeltas } from './update-counts';
