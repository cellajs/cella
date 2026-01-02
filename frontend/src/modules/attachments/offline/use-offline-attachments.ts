import { useCallback, useEffect, useRef } from 'react';
import type { Attachment } from '~/api.gen';
import {
  type AttachmentOfflineExecutor,
  createAttachmentOfflineExecutor,
} from '~/modules/attachments/offline/executor';
import { registerExecutor, unregisterExecutor } from '~/query/offline-manager';

interface UseOfflineAttachmentsProps {
  // biome-ignore lint/suspicious/noExplicitAny: TanStack DB collection types are complex
  attachmentsCollection: any;
  organizationId: string;
}

interface OfflineState {
  isLeader: boolean;
  pendingCount: number;
  isProcessing: boolean;
}

/**
 * Hook to manage offline-first attachment operations using TanStack Offline Transactions.
 *
 * Provides:
 * - Automatic offline persistence and sync when back online
 * - Multi-tab coordination (only one tab handles sync)
 * - Exponential backoff retry for failed operations
 *
 * @example
 * ```tsx
 * const { insertOffline, updateOffline, deleteOffline, getState } = useOfflineAttachments({
 *   attachmentsCollection,
 *   organizationId,
 * });
 *
 * // Insert with offline support
 * await insertOffline([newAttachment]);
 *
 * // Update with offline support
 * await updateOffline(attachmentId, { name: 'New name' });
 *
 * // Delete with offline support
 * await deleteOffline([attachmentId]);
 *
 * // Get current state (doesn't trigger re-renders)
 * const state = getState();
 * ```
 */
export const useOfflineAttachments = ({ attachmentsCollection, organizationId }: UseOfflineAttachmentsProps) => {
  const executorRef = useRef<AttachmentOfflineExecutor | null>(null);
  // Use ref instead of state to avoid periodic re-renders
  // Consumers can call getState() when they need the current state
  const stateRef = useRef<OfflineState>({
    isLeader: false,
    pendingCount: 0,
    isProcessing: false,
  });

  // Initialize the offline executor
  useEffect(() => {
    const executorKey = `attachments-${organizationId}`;

    const executor = createAttachmentOfflineExecutor({
      attachmentsCollection,
      orgIdOrSlug: organizationId,
    });

    executorRef.current = executor;

    // Register with the global offline manager for coordinated lifecycle
    registerExecutor(executorKey, executor);

    // Update pending count periodically (stored in ref, no re-renders)
    const updatePendingCount = async () => {
      if (!executorRef.current) return;
      const outbox = await executorRef.current.peekOutbox();
      stateRef.current = {
        ...stateRef.current,
        pendingCount: outbox.length,
        isLeader: executorRef.current?.isOfflineEnabled ?? false,
      };
    };

    // Initial check
    updatePendingCount();

    // Check periodically
    const interval = setInterval(updatePendingCount, 5000);

    return () => {
      clearInterval(interval);
      unregisterExecutor(executorKey);
      executorRef.current = null;
    };
  }, [attachmentsCollection, organizationId]);

  /**
   * Insert attachments with offline support
   */
  const insertOffline = useCallback(
    async (attachments: Attachment[]) => {
      if (!executorRef.current) {
        console.warn('[Offline] Executor not initialized, falling back to direct insert');
        for (const attachment of attachments) {
          attachmentsCollection.insert(attachment);
        }
        return;
      }

      const tx = executorRef.current.createOfflineTransaction({
        mutationFnName: 'createAttachments',
        autoCommit: false,
      });

      tx.mutate(() => {
        for (const attachment of attachments) {
          attachmentsCollection.insert(attachment);
        }
      });

      stateRef.current = { ...stateRef.current, isProcessing: true };

      try {
        await tx.commit();
      } finally {
        stateRef.current = { ...stateRef.current, isProcessing: false };
      }
    },
    [attachmentsCollection],
  );

  /**
   * Update an attachment with offline support
   */
  const updateOffline = useCallback(
    async (id: string, changes: Partial<Attachment>) => {
      if (!executorRef.current) {
        console.warn('[Offline] Executor not initialized, falling back to direct update');
        attachmentsCollection.update(id, (draft: Attachment) => {
          Object.assign(draft, changes);
        });
        return;
      }

      const tx = executorRef.current.createOfflineTransaction({
        mutationFnName: 'updateAttachment',
        autoCommit: false,
      });

      tx.mutate(() => {
        attachmentsCollection.update(id, (draft: Attachment) => {
          Object.assign(draft, changes);
        });
      });

      stateRef.current = { ...stateRef.current, isProcessing: true };

      try {
        await tx.commit();
      } finally {
        stateRef.current = { ...stateRef.current, isProcessing: false };
      }
    },
    [attachmentsCollection],
  );

  /**
   * Delete attachments with offline support
   */
  const deleteOffline = useCallback(
    async (ids: string[]) => {
      if (!executorRef.current) {
        console.warn('[Offline] Executor not initialized, falling back to direct delete');
        for (const id of ids) {
          attachmentsCollection.delete(id);
        }
        return;
      }

      const tx = executorRef.current.createOfflineTransaction({
        mutationFnName: 'deleteAttachments',
        autoCommit: false,
      });

      tx.mutate(() => {
        for (const id of ids) {
          attachmentsCollection.delete(id);
        }
      });

      stateRef.current = { ...stateRef.current, isProcessing: true };

      try {
        await tx.commit();
      } finally {
        stateRef.current = { ...stateRef.current, isProcessing: false };
      }
    },
    [attachmentsCollection],
  );

  /**
   * Manually trigger sync (useful after coming back online)
   */
  const triggerSync = useCallback(() => {
    executorRef.current?.notifyOnline();
  }, []);

  /**
   * Get all pending transactions
   */
  const getPendingTransactions = useCallback(async () => {
    return executorRef.current?.peekOutbox() ?? [];
  }, []);

  /**
   * Wait for a specific transaction to complete
   */
  const waitForTransaction = useCallback(async (transactionId: string) => {
    return executorRef.current?.waitForTransactionCompletion(transactionId);
  }, []);

  /**
   * Get current offline state (doesn't trigger re-renders)
   */
  const getState = useCallback(() => stateRef.current, []);

  return {
    // State (use getState() to access without triggering re-renders)
    getState,
    isOfflineEnabled: executorRef.current?.isOfflineEnabled ?? false,

    // Actions
    insertOffline,
    updateOffline,
    deleteOffline,

    // Utilities
    triggerSync,
    getPendingTransactions,
    waitForTransaction,
  };
};
