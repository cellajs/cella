/**
 * Offline sync utilities.
 *
 * Provides transaction metadata and conflict detection for OfflineEntityType:
 * - HLC timestamps for ordering
 * - Transaction metadata creation
 * - Field-level conflict detection (persisted to localStorage)
 * - Mutation squashing and coalescing
 */

export { detectChangedFields } from './detect-changed-fields';
export {
  clearAllFieldTransactions,
  clearEntityTransactions,
  getExpectedTransactionId,
  setFieldTransactionId,
  useFieldTransactionStore,
} from './field-transaction-store';
export {
  compareTransactionIds,
  createTransactionId,
  parseTransactionId,
  receiveTransactionId,
  sourceId,
} from './hlc';
export { coalescePendingCreate, hasPendingDelete, squashPendingMutation } from './squash-utils';
export {
  createTxForCreate,
  createTxForDelete,
  createTxForUpdate,
  type TxMetadata,
  type TxResponse,
  updateFieldTransactions,
} from './tx-utils';
