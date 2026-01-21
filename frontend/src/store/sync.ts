import type { ProductEntityType } from 'config';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';

/** Transaction status in the sync lifecycle */
export type TransactionStatus = 'pending' | 'confirmed' | 'failed';

/** Connection status for the sync stream */
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

/** Tracked transaction with metadata */
interface TrackedTransaction {
  transactionId: string;
  entityType: ProductEntityType;
  entityId: string;
  changedField: string | null;
  status: TransactionStatus;
  createdAt: number;
  error?: string;
}

interface SyncStoreState {
  /** Current source ID for this tab (set on init) */
  sourceId: string | null;
  setSourceId: (sourceId: string) => void;

  /** Last known transaction ID per entity type (for catch-up) */
  lastKnownTransactionId: Record<ProductEntityType, string | null>;
  setLastKnownTransactionId: (entityType: ProductEntityType, transactionId: string) => void;

  /** Connection status for the SSE stream */
  connectionStatus: ConnectionStatus;
  setConnectionStatus: (status: ConnectionStatus) => void;

  /** Last successful connection time */
  lastConnectedAt: number | null;

  /** Pending transactions awaiting confirmation */
  pendingTransactions: Map<string, TrackedTransaction>;

  /** Add a pending transaction */
  addPendingTransaction: (transaction: Omit<TrackedTransaction, 'status' | 'createdAt'>) => void;

  /** Mark transaction as confirmed */
  confirmTransaction: (transactionId: string) => void;

  /** Mark transaction as failed */
  failTransaction: (transactionId: string, error: string) => void;

  /** Get count of pending transactions */
  getPendingCount: () => number;

  /** Get transactions for a specific entity */
  getEntityTransactions: (entityType: ProductEntityType, entityId: string) => TrackedTransaction[];

  /** Clear old confirmed transactions (cleanup) */
  clearOldTransactions: (maxAgeMs?: number) => void;

  /** Whether this tab is the sync leader */
  isLeader: boolean;
  setIsLeader: (isLeader: boolean) => void;

  /** Reset store to initial state */
  clearSyncStore: () => void;
}

const initStore: Pick<
  SyncStoreState,
  'sourceId' | 'lastKnownTransactionId' | 'connectionStatus' | 'lastConnectedAt' | 'pendingTransactions' | 'isLeader'
> = {
  sourceId: null,
  lastKnownTransactionId: {} as Record<ProductEntityType, string | null>,
  connectionStatus: 'disconnected',
  lastConnectedAt: null,
  pendingTransactions: new Map(),
  isLeader: false,
};

/**
 * Sync store for managing transaction tracking and stream connection state.
 * Not persisted to storage as state is transient per session.
 */
export const useSyncStore = create<SyncStoreState>()(
  devtools(
    immer((set, get) => ({
      ...initStore,

      setSourceId: (sourceId) => {
        set((state) => {
          state.sourceId = sourceId;
        });
      },

      setLastKnownTransactionId: (entityType, transactionId) => {
        set((state) => {
          state.lastKnownTransactionId[entityType] = transactionId;
        });
      },

      setConnectionStatus: (status) => {
        set((state) => {
          state.connectionStatus = status;
          if (status === 'connected') {
            state.lastConnectedAt = Date.now();
          }
        });
      },

      addPendingTransaction: (transaction) => {
        set((state) => {
          state.pendingTransactions.set(transaction.transactionId, {
            ...transaction,
            status: 'pending',
            createdAt: Date.now(),
          });
        });
      },

      confirmTransaction: (transactionId) => {
        set((state) => {
          const tx = state.pendingTransactions.get(transactionId);
          if (tx) {
            tx.status = 'confirmed';
          }
        });
      },

      failTransaction: (transactionId, error) => {
        set((state) => {
          const tx = state.pendingTransactions.get(transactionId);
          if (tx) {
            tx.status = 'failed';
            tx.error = error;
          }
        });
      },

      getPendingCount: () => {
        const state = get();
        let count = 0;
        for (const tx of state.pendingTransactions.values()) {
          if (tx.status === 'pending') count++;
        }
        return count;
      },

      getEntityTransactions: (entityType, entityId) => {
        const state = get();
        const result: TrackedTransaction[] = [];
        for (const tx of state.pendingTransactions.values()) {
          if (tx.entityType === entityType && tx.entityId === entityId) {
            result.push(tx);
          }
        }
        return result;
      },

      clearOldTransactions: (maxAgeMs = 5 * 60 * 1000) => {
        set((state) => {
          const now = Date.now();
          const toDelete: string[] = [];
          for (const [id, tx] of state.pendingTransactions.entries()) {
            if (tx.status !== 'pending' && now - tx.createdAt > maxAgeMs) {
              toDelete.push(id);
            }
          }
          for (const id of toDelete) {
            state.pendingTransactions.delete(id);
          }
        });
      },

      setIsLeader: (isLeader) => {
        set((state) => {
          state.isLeader = isLeader;
        });
      },

      clearSyncStore: () => {
        set(() => ({
          ...initStore,
          pendingTransactions: new Map(),
        }));
      },
    })),
    { name: 'sync-store', enabled: isDebugMode },
  ),
);
