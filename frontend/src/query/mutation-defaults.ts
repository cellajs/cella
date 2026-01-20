/**
 * Mutation Defaults Registry
 *
 * Defines default mutation functions for each entity type.
 * This is required for paused mutations to resume after page reload,
 * since mutationFn cannot be serialized to storage.
 *
 * @see https://tanstack.com/query/latest/docs/framework/react/guides/mutations#persisting-offline-mutations
 */
import type { Attachment, CreatePageData, Page, UpdateAttachmentData, UpdatePageData } from '~/api.gen';
import { createAttachment, createPage, deleteAttachments, deletePages, updateAttachment, updatePage } from '~/api.gen';
import { queryClient } from '~/query/query-client';

/**
 * Register default mutation functions for all entity types.
 * Call this once during app initialization.
 */
export function registerMutationDefaults() {
  // Page mutations
  queryClient.setMutationDefaults(['page', 'create'], {
    mutationFn: (body: CreatePageData['body']) => createPage({ body }),
  });

  queryClient.setMutationDefaults(['page', 'update'], {
    mutationFn: ({ id, body }: { id: string; body: UpdatePageData['body'] }) => updatePage({ body, path: { id } }),
  });

  queryClient.setMutationDefaults(['page', 'delete'], {
    mutationFn: async (pages: Page[]) => {
      const ids = pages.map(({ id }) => id);
      await deletePages({ body: { ids } });
    },
  });

  // Attachment mutations
  queryClient.setMutationDefaults(['attachment', 'create'], {
    mutationFn: ({ orgIdOrSlug, body }: { orgIdOrSlug: string; body: Attachment[] }) =>
      createAttachment({ path: { orgIdOrSlug }, body }),
  });

  queryClient.setMutationDefaults(['attachment', 'update'], {
    mutationFn: ({ orgIdOrSlug, id, body }: { orgIdOrSlug: string; id: string; body: UpdateAttachmentData['body'] }) =>
      updateAttachment({ body, path: { orgIdOrSlug, id } }),
  });

  queryClient.setMutationDefaults(['attachment', 'delete'], {
    mutationFn: async ({ orgIdOrSlug, attachments }: { orgIdOrSlug: string; attachments: Attachment[] }) => {
      const ids = attachments.map(({ id }) => id);
      await deleteAttachments({ path: { orgIdOrSlug }, body: { ids } });
    },
  });
}
