import { NonRetriableError, startOfflineExecutor } from '@tanstack/offline-transactions';
import type { Attachment } from '~/api.gen';
import { createAttachment, deleteAttachments, updateAttachment } from '~/api.gen';

interface AttachmentOfflineConfig {
  // biome-ignore lint/suspicious/noExplicitAny: TanStack DB collection types are complex
  attachmentsCollection: any;
  orgIdOrSlug: string;
}

/**
 * Creates an offline executor for attachment operations.
 *
 * This provides:
 * - Outbox-first persistence: Mutations are persisted before dispatch for zero data loss
 * - Automatic retry with exponential backoff and jitter
 * - Multi-tab coordination via leader election
 * - FIFO sequential processing
 */
export const createAttachmentOfflineExecutor = ({ attachmentsCollection, orgIdOrSlug }: AttachmentOfflineConfig) => {
  return startOfflineExecutor({
    collections: {
      attachments: attachmentsCollection,
    },
    mutationFns: {
      /**
       * Sync new attachments to the server
       */
      createAttachments: async ({ transaction, idempotencyKey }) => {
        const newAttachments = transaction.mutations.map(({ modified }) => modified as Attachment);

        try {
          await createAttachment({
            body: newAttachments,
            path: { orgIdOrSlug },
            // TODO: Add idempotency key header when backend supports it
          });

          console.info(`[Offline] Created ${newAttachments.length} attachments (key: ${idempotencyKey})`);
        } catch (error: unknown) {
          const err = error as { status?: number };
          // Don't retry on validation errors or quota exceeded
          if (err.status === 400 || err.status === 413 || err.status === 422) {
            throw new NonRetriableError(`Attachment creation failed: ${err.status}`);
          }
          throw error; // Will retry with backoff
        }
      },

      /**
       * Sync attachment updates to the server
       */
      updateAttachment: async ({ transaction }) => {
        try {
          for (const { changes: body, original } of transaction.mutations) {
            const originalAttachment = original as Attachment;
            await updateAttachment({
              body,
              path: { id: originalAttachment.id, orgIdOrSlug },
            });
          }

          console.info(`[Offline] Updated ${transaction.mutations.length} attachments`);
        } catch (error: unknown) {
          const err = error as { status?: number };
          if (err.status === 400 || err.status === 404 || err.status === 422) {
            throw new NonRetriableError(`Attachment update failed: ${err.status}`);
          }
          throw error;
        }
      },

      /**
       * Sync attachment deletions to the server
       */
      deleteAttachments: async ({ transaction }) => {
        const ids = transaction.mutations.map(({ modified }) => (modified as Attachment).id);

        try {
          await deleteAttachments({
            body: { ids },
            path: { orgIdOrSlug },
          });

          console.info(`[Offline] Deleted ${ids.length} attachments`);
        } catch (error: unknown) {
          const err = error as { status?: number };
          // Don't retry if already deleted or not found
          if (err.status === 404) {
            throw new NonRetriableError('Attachments already deleted');
          }
          throw error;
        }
      },
    },
    // Retry configuration
    jitter: true,
    // Filter out old transactions on retry
    beforeRetry: (transactions) => {
      const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
      return transactions.filter((tx) => tx.createdAt.getTime() > cutoff);
    },
    onLeadershipChange: (isLeader) => {
      if (isLeader) {
        console.info('[Offline] This tab is now the leader for offline sync');
      } else {
        console.warn('[Offline] Running in online-only mode (another tab is the leader)');
      }
    },
    onUnknownMutationFn: (name, tx) => {
      console.error(`[Offline] Unknown mutation function: ${name}`, tx);
    },
  });
};

export type AttachmentOfflineExecutor = ReturnType<typeof createAttachmentOfflineExecutor>;
