import { type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import { type GetAttachmentsParams, createAttachment, deleteAttachments } from '~/api/attachments';
import { queryClient } from '~/lib/router';
import type { Attachment } from '~/types/common';
import { nanoid } from '~/utils/nanoid';
import { formatUpdatedData, getQueryItems, handleNoOldData } from './helpers';
import type { ContextProp, InfiniteQueryData, QueryData } from './types';

type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
type AttachmentContextProp = ContextProp<Attachment, string[] | null>;

export const attachmentKeys = {
  all: () => ['attachments'] as const,
  lists: () => [...attachmentKeys.all(), 'list'] as const,
  list: (filters?: GetAttachmentsParams) => [...attachmentKeys.lists(), filters] as const,
  similar: (filters?: Pick<GetAttachmentsParams, 'orgIdOrSlug'>) => [...attachmentKeys.lists(), filters] as const,
  create: () => [...attachmentKeys.all(), 'create'] as const,
  delete: () => [...attachmentKeys.all(), 'delete'] as const,
};

export type AttachmentsCreateMutationQueryFnVariables = Parameters<typeof createAttachment>[0];

export const useAttachmentCreateMutation = () => {
  return useMutation<Attachment[], Error, AttachmentsCreateMutationQueryFnVariables>({
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

const onError = (
  _: Error,
  __: AttachmentsCreateMutationQueryFnVariables & AttachmentsDeleteMutationQueryFnVariables,
  context?: AttachmentContextProp[],
) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) {
      queryClient.setQueryData(queryKey, previousData);
    }
  }
  toast.error(t('common:error.create_resource', { resource: t('app:attachment') }));
};

queryClient.setMutationDefaults(attachmentKeys.create(), {
  mutationFn: createAttachment,
  onMutate: async (variables) => {
    const { attachments, organizationId } = variables;

    const context: AttachmentContextProp[] = [];

    const newAttachments: Attachment[] = [];
    const optimisticIds: string[] = [];

    for (const attachment of attachments) {
      const optimisticId = attachment.id || nanoid();
      const newAttachment: Attachment = {
        ...attachment,
        name: attachment.filename.split('.').slice(0, -1).join('.'),
        id: optimisticId,
        entity: 'attachment',
        createdAt: new Date().toISOString(),
        createdBy: null,
        modifiedAt: new Date().toISOString(),
        modifiedBy: null,
      };

      newAttachments.push(newAttachment);
      optimisticIds.push(optimisticId);
    }

    const queries = await getPreviousData(organizationId);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update the list
      if (previousData) {
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return handleNoOldData(oldData);
          const prevItems = getQueryItems(oldData);
          const updatedItems = [...newAttachments, ...prevItems];
          return formatUpdatedData(oldData, updatedItems);
        });
      }

      context.push([queryKey, previousData, optimisticIds]);
    }

    return context;
  },

  onSuccess: (createdAttachments, { organizationId }, context) => {
    const queries = getQueries(organizationId);

    for (const query of queries) {
      const [activeKey] = query;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData);
        const prevItems = getQueryItems(oldData);
        const [_, __, optimisticIds] = context.find(([key]) => JSON.stringify(key) === JSON.stringify(activeKey)) ?? [];
        const ids = optimisticIds || [];
        const optimisticAttachments = createdAttachments.filter((el) => ids.includes(el.id));

        const updatedItems = prevItems.map((item) => {
          const createdItem = optimisticAttachments.find((created) => created.id === item.id);
          return createdItem ? { ...item, ...createdItem } : item;
        });
        return formatUpdatedData(oldData, updatedItems);
      });
    }
    toast.success(t('common:success.create_resources', { resources: t('common:attachments') }));
  },

  onError,
});

queryClient.setMutationDefaults(attachmentKeys.delete(), {
  mutationFn: deleteAttachments,
  onMutate: async (variables) => {
    const { ids, orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = [];

    const queries = await getPreviousData(orgIdOrSlug);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return handleNoOldData(oldData);
          const prevItems = getQueryItems(oldData);
          const updatedItems = prevItems.filter((item) => !ids.includes(item.id));

          return formatUpdatedData(oldData, updatedItems);
        });
      }
      context.push([queryKey, previousData, null]);
    }

    return context;
  },
  onError,
});

const getPreviousData = async (orgIdOrSlug: string) => {
  // Snapshot the previous value
  const queries = getQueries(orgIdOrSlug);

  for (const query of queries) {
    const [queryKey, _] = query;
    // Cancel any outgoing refetches
    // (so they don't overwrite our optimistic update)
    await queryClient.cancelQueries({ queryKey });
  }
  return queries;
};

const getExact = (orgIdOrSlug: string): [QueryKey, AttachmentInfiniteQueryData | undefined][] => {
  const queryKey = attachmentKeys.list({ orgIdOrSlug });
  return [[queryKey, queryClient.getQueryData<AttachmentInfiniteQueryData>(queryKey)]];
};

const getSimilar = (orgIdOrSlug: string): [QueryKey, AttachmentInfiniteQueryData | AttachmentQueryData | undefined][] => {
  return queryClient.getQueriesData<AttachmentInfiniteQueryData | AttachmentQueryData>({
    queryKey: attachmentKeys.similar({ orgIdOrSlug }),
  });
};

const getQueries = (orgIdOrSlug: string): [QueryKey, AttachmentInfiniteQueryData | AttachmentQueryData | undefined][] => {
  const exactQuery = getExact(orgIdOrSlug);
  const similarQueries = getSimilar(orgIdOrSlug);

  return [...exactQuery, ...similarQueries];
};
