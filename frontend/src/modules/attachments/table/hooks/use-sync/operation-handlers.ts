import { attachmentsKeys } from '~/modules/attachments/query';
import type { AttachmentInfiniteQueryData } from '~/modules/attachments/query-mutations';
import type { Attachment } from '~/modules/attachments/types';
import { getQueryKeySortOrder } from '~/query/helpers';

import { getSimilarQueries } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';

// Handle new attachment insert
export const handleInsert = (orgIdOrSlug: string, newAttachments: Attachment[]) => {
  const queries = getSimilarQueries(attachmentsKeys.similar({ orgIdOrSlug }));

  for (const [queryKey] of queries) {
    const { sort, order: insertOrder } = getQueryKeySortOrder(queryKey);

    if ((sort && sort !== 'createdAt') || (sort === 'createdAt' && insertOrder === 'asc')) {
      queryClient.invalidateQueries({ queryKey, exact: true });
      continue;
    }

    queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
      if (!data) return;

      // Collect existing IDs for faster lookup
      const existingIds = new Set(data.pages.flatMap((page) => page.items.map(({ id }) => id)));
      // Filter out duplicates
      const uniqueAttachments = newAttachments.filter(({ id }) => !existingIds.has(id));

      // Avoid adding an already existing attachment
      if (!uniqueAttachments.length) return data;

      // Add new attachments and update total count
      const pages = data.pages.map(({ items, total }) => ({
        items: insertOrder === 'asc' ? [...items, ...uniqueAttachments] : [...uniqueAttachments, ...items],
        total: total + uniqueAttachments.length,
      }));

      return { pages, pageParams: data.pageParams };
    });
  }
};

// Handle attachment update
export const handleUpdate = (orgIdOrSlug: string, updatedAttachments: Attachment[]) => {
  const queries = getSimilarQueries(attachmentsKeys.similar({ orgIdOrSlug }));

  for (const [queryKey] of queries) {
    queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
      if (!data) return;

      // Create a map for quick lookup of updated attachments
      const updatesMap = new Map(updatedAttachments.map((attachment) => [attachment.id, attachment]));

      // Batch update matching attachments
      const pages = data.pages.map(({ items, total }) => ({
        items: items.map((a) => (updatesMap.has(a.id) ? { ...a, ...updatesMap.get(a.id) } : a)),
        total,
      }));

      return { pages, pageParams: data.pageParams };
    });
  }
};

// Handle attachment deletion in attachment query
export const handleDelete = (orgIdOrSlug: string, attachmentIds: string[]) => {
  const queries = getSimilarQueries(attachmentsKeys.similar({ orgIdOrSlug }));

  for (const [queryKey] of queries) {
    queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
      if (!data) return;

      // Remove the attachment and adjust total
      const pages = data.pages.map(({ items, total }) => {
        const newItems = items.filter((item) => !attachmentIds.includes(item.id));
        const difference = items.length - newItems.length;
        return {
          items: newItems,
          total: total - difference,
        };
      });

      return { pages, pageParams: data.pageParams };
    });
  }
};
