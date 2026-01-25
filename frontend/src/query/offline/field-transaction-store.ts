import { appConfig } from 'config';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserStreamMessage } from '../realtime';

/**
 * Key for field transaction lookup: entityType:entityId:field
 */
type FieldKey = `${string}:${string}:${string}`;

/**
 * Store for tracking last-seen transaction IDs per field.
 * Used for conflict detection: when mutating a field, we send the
 * expected transaction ID so the backend can detect if another
 * client has modified the same field.
 *
 * Persisted to localStorage to survive page refresh.
 */
interface FieldTransactionState {
  /** Record of field key to last-seen transaction ID (Record for JSON serialization) */
  fieldTransactions: Record<FieldKey, string>;
}

interface FieldTransactionActions {
  /** Get the expected transaction ID for a field */
  getExpectedTransactionId: (entityType: string, entityId: string, field: string) => string | null;

  /** Set the transaction ID for a specific field */
  setFieldTransactionId: (entityType: string, entityId: string, field: string, transactionId: string) => void;

  /** Update field transaction from a stream message */
  updateFromStreamMessage: (message: UserStreamMessage) => void;

  /** Clear transactions for a specific entity (e.g., on delete) */
  clearEntity: (entityType: string, entityId: string) => void;

  /** Clear all tracked transactions (e.g., on logout) */
  clear: () => void;
}

type FieldTransactionStore = FieldTransactionState & FieldTransactionActions;

/**
 * Build a field key from entity type, ID, and field name.
 */
function buildFieldKey(entityType: string, entityId: string, field: string): FieldKey {
  return `${entityType}:${entityId}:${field}`;
}

/**
 * Field transaction store with localStorage persistence.
 * Tracks the last-seen transactionId for each (entityType, entityId, field) tuple.
 */
export const useFieldTransactionStore = create<FieldTransactionStore>()(
  persist(
    (set, get) => ({
      fieldTransactions: {},

      getExpectedTransactionId: (entityType, entityId, field) => {
        const key = buildFieldKey(entityType, entityId, field);
        return get().fieldTransactions[key] ?? null;
      },

      setFieldTransactionId: (entityType, entityId, field, transactionId) => {
        const key = buildFieldKey(entityType, entityId, field);
        set((state) => ({
          fieldTransactions: { ...state.fieldTransactions, [key]: transactionId },
        }));
      },

      updateFromStreamMessage: (message) => {
        const { entityType, entityId, tx, changedKeys } = message;

        if (!tx?.transactionId) return;

        const transactionId = tx.transactionId;

        set((state) => {
          const updates: Record<string, string> = {};

          // If changedField is specified, update just that field
          if (tx.changedField) {
            const key = buildFieldKey(entityType, entityId, tx.changedField);
            updates[key] = transactionId;
          }
          // Otherwise, update all changed keys (fallback for bulk updates)
          else if (changedKeys) {
            for (const field of changedKeys) {
              const key = buildFieldKey(entityType, entityId, field);
              updates[key] = transactionId;
            }
          }

          return { fieldTransactions: { ...state.fieldTransactions, ...updates } };
        });
      },

      clearEntity: (entityType, entityId) => {
        const prefix = `${entityType}:${entityId}:`;
        set((state) => {
          const filtered = Object.fromEntries(
            Object.entries(state.fieldTransactions).filter(([key]) => !key.startsWith(prefix)),
          ) as Record<FieldKey, string>;
          return { fieldTransactions: filtered };
        });
      },

      clear: () => {
        set({ fieldTransactions: {} });
      },
    }),
    { name: `${appConfig.slug}-field-transactions` },
  ),
);

// ═══════════════════════════════════════════════════════════════════════════
// Non-hook API for use outside React components
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get expected transaction ID for a field mutation.
 * Use this when sending update mutations.
 */
export function getExpectedTransactionId(entityType: string, entityId: string, field: string): string | null {
  return useFieldTransactionStore.getState().getExpectedTransactionId(entityType, entityId, field);
}

/**
 * Set the transaction ID for a field after a successful mutation.
 * Use this in onSuccess to track the new baseline.
 */
export function setFieldTransactionId(
  entityType: string,
  entityId: string,
  field: string,
  transactionId: string,
): void {
  useFieldTransactionStore.getState().setFieldTransactionId(entityType, entityId, field, transactionId);
}

/**
 * Clear all tracked transactions for an entity (e.g., after delete).
 */
export function clearEntityTransactions(entityType: string, entityId: string): void {
  useFieldTransactionStore.getState().clearEntity(entityType, entityId);
}

/**
 * Clear all field transactions (e.g., on logout).
 */
export function clearAllFieldTransactions(): void {
  useFieldTransactionStore.getState().clear();
}
