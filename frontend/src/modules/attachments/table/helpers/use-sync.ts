import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/lib/router';

import type { AttachmentInfiniteQueryData } from '~/modules/attachments/query-mutations';

import { env } from '~/../env';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import type { Attachment } from '~/modules/attachments/types';

import { objectKeys } from '~/utils/object';
import { attachmentsTableColumns } from '#/db/schema/attachments';

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

export const useSync = (organizationId: string) => {
  const { isOnline } = useOnlineManager();

  useEffect(() => {
    if (!isOnline || !config.has.sync || env.VITE_QUICK) return;

    const shapeStream = new ShapeStream<RawAttachment>(attachmentShape(organizationId));
    const queryKey = attachmentsQueryOptions({ orgIdOrSlug: organizationId }).queryKey;

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

    const handleUpdate = (updatedAttachment: Attachment) => {
      queryClient.setQueryData(queryKey, (data) => {
        if (!data) return;
        const { id } = updatedAttachment;

        // Update items in each page and adjust the total
        const pages = data.pages.map(({ items, total }) => ({
          items: items.map((attachment) => (attachment.id === id ? { ...attachment, updatedAttachment } : attachment)),
          total,
        }));

        return { pages, pageParams: data.pageParams };
      });
    };

    const handleDelete = (attachmentId: string) => {
      queryClient.setQueryData<AttachmentInfiniteQueryData>(queryKey, (data) => {
        if (!data) return;
        // Update items in each page and adjust the total
        const pages = data.pages.map(({ items, total }) => ({
          items: items.filter((item) => item.id !== attachmentId),
          total: total - 1,
        }));

        return { pages, pageParams: data.pageParams };
      });
    };

    const unsubscribe = shapeStream.subscribe((messages) => {
      // avoid initial load
      if (shapeStream.isLoading()) return;

      const operationMessages = messages.filter((m) => m.headers.operation);

      for (const message of operationMessages) {
        // to avoid trigger on messages without values
        if (!('value' in message) || !message.value) continue;

        const { value } = message as ChangeMessage<RawAttachment>;
        const parsedAttachment = parseRawAttachment(value);

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
