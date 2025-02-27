import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/query/query-client';

import type { AttachmentInfiniteQueryData } from '~/modules/attachments/query-mutations';

import { env } from '~/env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import type { Attachment } from '~/modules/attachments/types';
import { objectKeys } from '~/utils/object';

// Type definition for raw attachment data received from DataBase
type RawAttachment = {
  id: string;
  filename: string;
  content_type: string;
  size: string;
  organization_id: string;
  created_at: string;
  created_by: string;
  modified_at: string;
  modified_by: string;
};

// Mapping of raw attachment keys to Attachment table type keys
const attachmentsTableColumns: { [k: string]: string } = {
  id: 'id',
  name: 'name',
  filename: 'filename',
  content_type: 'contentType',
  size: 'size',
  entity: 'entity',
  url: 'url',
  created_at: 'createdAt',
  created_by: 'createdBy',
  modified_at: 'modifiedAt',
  modified_by: 'modifiedBy',
  organization_id: 'organizationId',
};

// Parses raw attachment data into the Attachment type
const parseRawAttachment = (rawAttachment: RawAttachment): Attachment => {
  const columnEntries = Object.entries(attachmentsTableColumns);
  const attachment = {} as unknown as Attachment;
  for (const key of objectKeys(rawAttachment)) {
    const columnEntry = columnEntries.find(([, columnName]) => columnName === key);
    if (!columnEntry) continue;
    const columnName = columnEntry[0] as keyof Attachment;
    attachment[columnName] = rawAttachment[key] as never;
  }
  return attachment;
};

// Configures ShapeStream options for real-time syncing of attachments
const attachmentShape = (organizationId: string): ShapeStreamOptions => ({
  url: new URL(`/${organizationId}/attachments/shape-proxy`, config.backendUrl).href,
  params: { where: `organization_id = '${organizationId}'` },
  backoffOptions: {
    initialDelay: 500,
    maxDelay: 32000,
    multiplier: 2,
  },
  fetchClient: (input, init) =>
    fetch(input, {
      ...init,
      credentials: 'include',
    }),
});

// Custom hook to sync attachments in real-time for a specific organization
export const useSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();

  useEffect(() => {
    // Exit if offline, sync is disabled, or in quick mode
    if (!isOnline || !config.has.sync || env.VITE_QUICK) return;

    // Initialize ShapeStream to listen for changes
    const shapeStream = new ShapeStream<RawAttachment>(attachmentShape(organizationId));
    // Get attachments queryKey to update query on DB changes
    const queryKey = attachmentsQueryOptions({ orgIdOrSlug: organizationId }).queryKey;

    // Handle new attachment insert
    const handleInsert = (newAttachment: Attachment) => {
      queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
        if (!data) return;

        // Avoid adding an already existing attachment
        const alreadyExistingIds = data.pages.flatMap((a) => a.items.map(({ id }) => id));
        if (alreadyExistingIds.includes(newAttachment.id)) return data;

        // Update items in each page and adjust the total
        const pages = data.pages.map(({ items, total }) => ({
          items: [...items, newAttachment],
          total: total + 1,
        }));

        return { pages, pageParams: data.pageParams };
      });
    };

    // Handle attachment update
    const handleUpdate = (updatedAttachment: Attachment) => {
      queryClient.setQueryData(queryKey, (data) => {
        if (!data) return;
        const { id } = updatedAttachment;

        // Update matching attachment in each page
        const pages = data.pages.map(({ items, total }) => ({
          items: items.map((attachment) => (attachment.id === id ? { ...attachment, ...updatedAttachment } : attachment)),
          total,
        }));

        return { pages, pageParams: data.pageParams };
      });
    };

    // Handle attachment deletion in attachment query
    const handleDelete = (attachmentId: string) => {
      queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
        if (!data) return;

        // Remove the attachment and adjust total
        const pages = data.pages.map(({ items, total }) => {
          const newItems = items.filter((item) => item.id !== attachmentId);
          const difference = newItems.length - items.length;
          return {
            items: newItems,
            total: total - difference,
          };
        });

        return { pages, pageParams: data.pageParams };
      });
    };

    // Subscribe to ShapeStream for real-time updates
    const unsubscribe = shapeStream.subscribe((messages) => {
      // Avoid triggering on initial load
      if (shapeStream.isLoading()) return;

      //Filter out only operation messages(create, update, delete)
      const operationMessages = messages.filter((m) => m.headers.operation);

      for (const message of operationMessages) {
        // Skip messages without value
        if (!('value' in message) || !message.value) continue;

        const { value } = message as ChangeMessage<RawAttachment>;
        const parsedAttachment = parseRawAttachment(value);

        // Handle operations based on message type
        switch (message.headers.operation) {
          case 'insert':
            handleInsert(parsedAttachment);
            break;
          case 'update':
            handleUpdate(parsedAttachment);
            break;
          case 'delete':
            handleDelete(parsedAttachment.id);
            break;
        }
      }
    });

    return () => unsubscribe();
  }, [isOnline]);
};
