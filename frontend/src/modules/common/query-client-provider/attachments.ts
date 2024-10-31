import { type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import { type GetAttachmentsParams, createAttachment, deleteAttachments } from '~/api/attachments';
import { queryClient } from '~/lib/router';
import type { Attachment } from '~/types/common';
import { nanoid } from '~/utils/nanoid';

type QueryFnData = {
  items: Attachment[];
  total: number;
};

export type AttachmentInfiniteQueryFnData = {
  pageParams: number[];
  pages: QueryFnData[];
};

export const attachmentKeys = {
  all: () => ['attachments'] as const,
  lists: () => [...attachmentKeys.all(), 'list'] as const,
  list: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentKeys.lists(), filters] as const,
  create: () => [...attachmentKeys.all(), 'create'] as const,
  delete: () => [...attachmentKeys.all(), 'delete'] as const,
};

export type AttachmentsCreateMutationQueryFnVariables = Parameters<typeof createAttachment>[0];

export const useAttachmentCreateMutation = () => {
  return useMutation<Attachment, Error, AttachmentsCreateMutationQueryFnVariables>({
    mutationKey: attachmentKeys.create(),
    mutationFn: createAttachment,
  });
};

export type AttachmentsDeleteMutationQueryFnVariables = Parameters<typeof deleteAttachments>[0];

export const useAttachmentDeleteMutation = () => {
  return useMutation<boolean, Error, AttachmentsDeleteMutationQueryFnVariables>({
    mutationKey: attachmentKeys.delete(),
    mutationFn: deleteAttachments,
  });
};

const getPreviousData = async (queryKey: QueryKey) => {
  // Cancel any outgoing refetches
  // (so they don't overwrite our optimistic update)
  await queryClient.cancelQueries({ queryKey });

  // Snapshot the previous value
  const data = queryClient.getQueryData<AttachmentInfiniteQueryFnData>(queryKey);

  return data;
};

const onError = (
  _: Error,
  { organizationId, orgIdOrSlug }: AttachmentsCreateMutationQueryFnVariables & AttachmentsDeleteMutationQueryFnVariables,
  context?: { previousData?: AttachmentInfiniteQueryFnData },
) => {
  if (context?.previousData) {
    orgIdOrSlug = orgIdOrSlug || organizationId;
    queryClient.setQueryData(attachmentKeys.list({ orgIdOrSlug }), context.previousData);
  }
  toast.error(t('common:error.create_resource', { resource: t('app:attachment') }));
};

queryClient.setMutationDefaults(attachmentKeys.create(), {
  mutationFn: createAttachment,
  onMutate: async (variables) => {
    const { id, organizationId } = variables;

    const optimisticId = id || nanoid();
    const newAttachment: Attachment = {
      ...variables,
      id: optimisticId,
      entity: 'attachment',
      createdAt: new Date().toISOString(),
      createdBy: null,
      modifiedAt: new Date().toISOString(),
      modifiedBy: null,
    };

    const queryKey = attachmentKeys.list({ orgIdOrSlug: organizationId });

    const previousData = await getPreviousData(queryKey);

    // Optimistically update to the new value
    if (previousData) {
      queryClient.setQueryData<AttachmentInfiniteQueryFnData>(queryKey, {
        ...previousData,
        pages: [
          {
            ...previousData.pages[0],
            items: [newAttachment, ...previousData.pages[0].items],
          },
          ...previousData.pages.slice(1),
        ],
      });
    }

    return { previousData, optimisticId };
  },
  onSuccess: (createdAttachment, { organizationId }, { optimisticId }) => {
    const queryKey = attachmentKeys.list({ orgIdOrSlug: organizationId });

    queryClient.setQueryData<AttachmentInfiniteQueryFnData>(queryKey, (oldData) => {
      if (!oldData) return oldData;
      const items = oldData.pages[0].items;
      const updatedItems = items.map((item) => (item.id === optimisticId ? createdAttachment : item));
      return {
        ...oldData,
        pages: [{ ...oldData.pages[0], items: updatedItems }, ...oldData.pages.slice(1)],
      };
    });

    toast.success(t('common:success.create_resource', { resource: t('common:attachment') }));
  },
  onError,
});

queryClient.setMutationDefaults(attachmentKeys.delete(), {
  mutationFn: deleteAttachments,
  onMutate: async (variables) => {
    const { ids, orgIdOrSlug } = variables;

    const queryKey = attachmentKeys.list({ orgIdOrSlug });

    const previousData = await getPreviousData(queryKey);

    queryClient.setQueryData<AttachmentInfiniteQueryFnData>(queryKey, (oldData) => {
      if (!oldData) return oldData;
      const items = oldData.pages[0].items;
      const updatedItems = items.filter((item) => !ids.includes(item.id));
      return {
        ...oldData,
        pages: [{ ...oldData.pages[0], items: updatedItems }, ...oldData.pages.slice(1)],
      };
    });

    return { previousData };
  },
  onError,
});
