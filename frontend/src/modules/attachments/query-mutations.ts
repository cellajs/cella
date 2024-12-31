import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { t } from 'i18next';
import { toast } from 'sonner';
import { queryClient } from '~/lib/router';
import { createAttachment, deleteAttachments, updateAttachment } from '~/modules/attachments/api';
import { attachmentsKeys } from '~/modules/attachments/query';
import { compareQueryKeys } from '~/query/helpers';
import { formatUpdatedData, getCancelingRefetchQueries, getQueries, getQueryItems, handleNoOldData } from '~/query/helpers/mutate-query';
import type { ContextProp, InfiniteQueryData, QueryData } from '~/query/types';
import type { Attachment } from '~/types/common';
import { nanoid } from '~/utils/nanoid';

type AttachmentQueryData = QueryData<Attachment>;
export type AttachmentInfiniteQueryData = InfiniteQueryData<Attachment>;
type AttachmentContextProp = ContextProp<Attachment, string[] | null>;

const limit = config.requestLimits.attachments;

export type AttachmentsCreateMutationQueryFnVariables = Parameters<typeof createAttachment>[0];

export const useAttachmentCreateMutation = () => {
  return useMutation<Attachment[], Error, AttachmentsCreateMutationQueryFnVariables>({
    mutationKey: attachmentsKeys.create(),
    mutationFn: createAttachment,
  });
};

export type AttachmentsUpdateMutationQueryFnVariables = Parameters<typeof updateAttachment>[0];

export const useAttachmentUpdateMutation = () => {
  return useMutation<boolean, Error, AttachmentsUpdateMutationQueryFnVariables>({
    mutationKey: attachmentsKeys.update(),
    mutationFn: updateAttachment,
  });
};

export type AttachmentsDeleteMutationQueryFnVariables = Parameters<typeof deleteAttachments>[0];

export const useAttachmentDeleteMutation = () => {
  return useMutation<boolean, Error, AttachmentsDeleteMutationQueryFnVariables>({
    mutationKey: attachmentsKeys.delete(),
    mutationFn: deleteAttachments,
  });
};

const onError = (
  _: Error,
  __: AttachmentsCreateMutationQueryFnVariables & AttachmentsDeleteMutationQueryFnVariables & AttachmentsUpdateMutationQueryFnVariables,
  context?: AttachmentContextProp[],
) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) {
      queryClient.setQueryData(queryKey, previousData);
    }
  }
  toast.error(t('common:error.create_resource', { resource: t('common:attachment') }));
};

queryClient.setMutationDefaults(attachmentsKeys.create(), {
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

    const exactKey = attachmentsKeys.table({ orgIdOrSlug: organizationId });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug: organizationId });

    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update the list
      if (previousData) {
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return handleNoOldData(oldData);
          const prevItems = getQueryItems(oldData);
          const updatedItems = [...newAttachments, ...prevItems];
          return formatUpdatedData(oldData, updatedItems, limit, newAttachments.length);
        });
      }

      context.push([queryKey, previousData, optimisticIds]);
    }

    return context;
  },

  onSuccess: (createdAttachments, { organizationId }, context) => {
    const exactKey = attachmentsKeys.table({ orgIdOrSlug: organizationId });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug: organizationId });

    const queries = getQueries<Attachment>(exactKey, similarKey);

    for (const query of queries) {
      const [activeKey] = query;

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(activeKey, (oldData) => {
        if (!oldData) return handleNoOldData(oldData);
        const prevItems = getQueryItems(oldData);
        const [_, __, optimisticIds] = context.find(([key]) => compareQueryKeys(key, activeKey)) ?? [];
        const ids = optimisticIds || [];
        const optimisticAttachments = createdAttachments.filter((el) => ids.includes(el.id));

        const updatedItems = prevItems.map((item) => {
          const createdItem = optimisticAttachments.find((created) => created.id === item.id);
          return createdItem ? { ...item, ...createdItem } : item;
        });
        return formatUpdatedData(oldData, updatedItems, limit, createdAttachments.length);
      });
    }
    toast.success(t('common:success.create_resources', { resources: t('common:attachments') }));
  },

  onError,
});

queryClient.setMutationDefaults(attachmentsKeys.update(), {
  mutationFn: updateAttachment,
  onMutate: async (variables: AttachmentsUpdateMutationQueryFnVariables) => {
    const { orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = [];

    const optimisticIds: string[] = [];

    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });

    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update the list
      if (previousData) {
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return handleNoOldData(oldData);
          const prevItems = getQueryItems(oldData);
          const updatedItems = prevItems.map((item) => {
            if (item.id === variables.id) {
              return { ...item, ...variables };
            }
            return item;
          });
          return formatUpdatedData(oldData, updatedItems, limit);
        });
      }

      context.push([queryKey, previousData, optimisticIds]);
    }

    return context;
  },
  onError,
});

queryClient.setMutationDefaults(attachmentsKeys.delete(), {
  mutationFn: deleteAttachments,
  onMutate: async (variables) => {
    const { ids, orgIdOrSlug } = variables;

    const context: AttachmentContextProp[] = [];
    const exactKey = attachmentsKeys.table({ orgIdOrSlug });
    const similarKey = attachmentsKeys.similar({ orgIdOrSlug });

    const queries = await getCancelingRefetchQueries<Attachment>(exactKey, similarKey);

    for (const [queryKey, previousData] of queries) {
      // Optimistically update to the new value
      if (previousData) {
        queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryKey, (oldData) => {
          if (!oldData) return handleNoOldData(oldData);
          const prevItems = getQueryItems(oldData);
          const updatedItems = prevItems.filter((item) => !ids.includes(item.id));

          return formatUpdatedData(oldData, updatedItems, limit, -ids.length);
        });
      }
      context.push([queryKey, previousData, null]);
    }

    return context;
  },
  onError,
});