/**
 * Transaction metadata utilities for offline mutations.
 *
 * Creates tx metadata for the { data, tx } wrapper pattern used by synced entities.
 * Handles HLC timestamps, source IDs, and conflict detection setup.
 */

import { getExpectedTransactionId, setFieldTransactionId } from './field-transaction-store';
import { createTransactionId, sourceId } from './hlc';

/** Transaction metadata sent to API in { data, tx } wrapper */
export interface TxMetadata {
  transactionId: string;
  sourceId: string;
  changedField: string | null;
  expectedTransactionId: string | null;
}

/** Transaction response from API */
export interface TxResponse {
  transactionId: string;
  changedField?: string | null;
}

/**
 * Create transaction metadata for a create mutation.
 * Creates don't need conflict detection (no existing entity).
 */
export function createTxForCreate(): TxMetadata {
  return {
    transactionId: createTransactionId(),
    sourceId,
    changedField: null,
    expectedTransactionId: null,
  };
}

/**
 * Create transaction metadata for an update mutation.
 * Includes expected transaction ID for conflict detection.
 *
 * @param entityType - Entity type (e.g., 'page')
 * @param entityId - Entity ID being updated
 * @param data - Update payload
 * @param trackedFields - Fields to track for conflict detection
 */
export function createTxForUpdate(
  entityType: string,
  entityId: string,
  data: object,
  trackedFields: readonly string[],
): TxMetadata {
  // Detect which tracked field is being changed
  const changedField = trackedFields.find((field) => field in data) ?? null;

  return {
    transactionId: createTransactionId(),
    sourceId,
    changedField,
    expectedTransactionId: changedField ? getExpectedTransactionId(entityType, entityId, changedField) : null,
  };
}

/**
 * Create transaction metadata for a delete mutation.
 * Deletes don't need field-level conflict detection.
 */
export function createTxForDelete(): TxMetadata {
  return {
    transactionId: createTransactionId(),
    sourceId,
    changedField: null,
    expectedTransactionId: null,
  };
}

/**
 * Update field transaction store after successful mutation.
 * Call this in onSuccess to track the new transaction ID.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @param tx - Transaction response from server
 */
export function updateFieldTransactions(entityType: string, entityId: string, tx: TxResponse | undefined): void {
  if (!tx?.transactionId) return;

  // Track the transaction ID for the changed field (or '_all' for creates/deletes)
  const field = tx.changedField ?? '_all';
  setFieldTransactionId(entityType, entityId, field, tx.transactionId);
}

/** Represents a JSONB type from the database that may contain tx metadata. */
type JsonbTx = string | number | boolean | null | { [key: string]: unknown } | unknown[];

/**
 * Initialize field transaction tracking from entity data.
 * Call this when fetching entities that include tx metadata.
 *
 * @param entityType - Entity type
 * @param entityId - Entity ID
 * @param tx - Transaction metadata from entity (may be null or generic JSONB type)
 */
export function initFieldTransactionFromEntity(entityType: string, entityId: string, tx: JsonbTx | undefined): void {
  // Narrow JSONB type to expected tx object shape
  if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return;

  const transactionId = typeof tx.transactionId === 'string' ? tx.transactionId : null;
  if (!transactionId) return;

  // Track the transaction ID for the changed field (or '_all' if not specified)
  const changedField = typeof tx.changedField === 'string' ? tx.changedField : null;
  const field = changedField ?? '_all';
  setFieldTransactionId(entityType, entityId, field, transactionId);
}
