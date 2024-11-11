import { type ChangeMessage, ShapeStream, type ShapeStreamOptions } from '@electric-sql/client';
import { config } from 'config';
import { useEffect } from 'react';
import { queryClient } from '~/lib/router';
import type { AttachmentInfiniteQueryFnData } from '~/modules/common/query-client-provider/attachments';
import { useGeneralStore } from '~/store/general';
import type { Attachment } from '~/types/common';
import { objectKeys } from '~/utils/object';
import { attachmentsTableColumns } from '#/db/schema/attachments';
import { env } from '../../../../../env';
import { attachmentsQueryOptions } from './query-options';

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
    const columnEntry = columnEntries.find(([, c]) => c.name === key);
    if (!columnEntry) {
      continue;
    }
    const columnName = columnEntry[0] as keyof Attachment;
    attachment[columnName] = rawAttachment[key] as never;
  }
  return attachment;
};

const attachmentShape = (organization_id?: string): ShapeStreamOptions => ({
  url: new URL(`/${organization_id}/attachments/shape-proxy`, config.backendUrl).href,
  where: organization_id ? `organization_id = '${organization_id}'` : undefined,
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
  const { networkMode } = useGeneralStore();

  // Subscribe to attachments updates
  useEffect(() => {
    if (networkMode !== 'online' || !config.has.sync || !env.VITE_HAS_SYNC) return;

    const shapeStream = new ShapeStream<RawAttachment>(attachmentShape(organizationId));
    const queryKey = attachmentsQueryOptions({ orgIdOrSlug: organizationId }).queryKey;
    const unsubscribe = shapeStream.subscribe((messages) => {
      const createMessage = messages.find((m) => m.headers.operation === 'insert') as ChangeMessage<RawAttachment> | undefined;
      if (createMessage) {
        const value = createMessage.value;
        queryClient.setQueryData<AttachmentInfiniteQueryFnData>(queryKey, (data) => {
          if (!data) return;
          const createdAttachment = parseRawAttachment(value);
          return {
            ...data,
            pages: [
              {
                ...data.pages[0],
                items: [createdAttachment, ...data.pages[0].items],
              },
              ...data.pages.slice(1),
            ],
          };
        });
      }

      const updateMessage = messages.find((m) => m.headers.operation === 'update') as ChangeMessage<RawAttachment> | undefined;
      if (updateMessage) {
        const value = updateMessage.value;
        queryClient.setQueryData(queryKey, (data) => {
          if (!data) return;
          return {
            ...data,
            pages: data.pages.map((page) => {
              return {
                ...page,
                items: page.items.map((attachment) => {
                  if (attachment.id === value.id) {
                    const updatedAttachment = {
                      ...attachment,
                      ...parseRawAttachment(value),
                    };
                    return updatedAttachment;
                  }

                  return attachment;
                }),
              };
            }),
          };
        });
      }

      const deleteMessage = messages.find((m) => m.headers.operation === 'delete') as ChangeMessage<RawAttachment> | undefined;
      if (deleteMessage) {
        queryClient.setQueryData<AttachmentInfiniteQueryFnData>(queryKey, (data) => {
          if (!data) return;
          return {
            ...data,
            pages: [
              {
                ...data.pages[0],
                items: data.pages[0].items.filter((item) => item.id !== deleteMessage.value.id),
              },
              ...data.pages.slice(1),
            ],
          };
        });
      }
    });
    return () => {
      unsubscribe();
    };
  }, [networkMode]);
};
