import { type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import { type GetLabelsParams, createLabel, updateLabel } from '~/api/labels';
import type { GetWorkspaceResponse } from '~/api/workspaces';
import { queryClient } from '~/lib/router';
import { workspaceQueryOptions } from '~/modules/workspaces/helpers/query-options';
import type { Label } from '~/types/app';
import { nanoid } from '~/utils/nanoid';

export type LabelsCreateMutationQueryFnVariables = Parameters<typeof createLabel>[0] & {
  workspaceSlug: string;
};
export type LabelsUpdateMutationQueryFnVariables = Parameters<typeof updateLabel>[0] & {
  workspaceSlug: string;
};

export const labelKeys = {
  all: () => ['labels'] as const,
  lists: () => ['labels', 'list'] as const,
  list: (filters?: GetLabelsParams) => [...labelKeys.lists(), filters] as const,
  create: () => [...labelKeys.all(), 'create'] as const,
  update: () => [...labelKeys.all(), 'update'] as const,
  delete: () => [...labelKeys.all(), 'delete'] as const,
};

export const useLabelCreateMutation = () => {
  return useMutation<Label, Error, LabelsCreateMutationQueryFnVariables>({
    mutationKey: labelKeys.create(),
    mutationFn: createLabel,
  });
};

export const useLabelUpdateMutation = () => {
  return useMutation<boolean, Error, LabelsUpdateMutationQueryFnVariables>({
    mutationKey: labelKeys.update(),
    mutationFn: updateLabel,
  });
};

const getPreviousWorkspace = async (queryKey: QueryKey) => {
  // Cancel any outgoing refetches
  // (so they don't overwrite our optimistic update)
  await queryClient.cancelQueries({ queryKey });
  // Snapshot the previous value
  const previousWorkspace = queryClient.getQueryData<GetWorkspaceResponse>(queryKey);

  return previousWorkspace;
};

const onError = (
  _: Error,
  {
    orgIdOrSlug,
    workspaceSlug,
  }: {
    orgIdOrSlug: string;
    workspaceSlug: string;
  },
  context?: { previousWorkspace?: GetWorkspaceResponse },
) => {
  if (context?.previousWorkspace) {
    const queryOptions = workspaceQueryOptions(workspaceSlug, orgIdOrSlug);
    queryClient.setQueryData(queryOptions.queryKey, context.previousWorkspace);
  }
};

queryClient.setMutationDefaults(labelKeys.create(), {
  mutationFn: createLabel,
  onMutate: async (variables: LabelsCreateMutationQueryFnVariables) => {
    const { orgIdOrSlug, workspaceSlug, ...label } = variables;

    const optimisticId = nanoid();
    const newLabel: Label = {
      ...label,
      id: optimisticId,
      color: label.color || null,
      organizationId: orgIdOrSlug,
      lastUsedAt: new Date().toISOString(),
    };

    const queryOptions = workspaceQueryOptions(workspaceSlug, orgIdOrSlug);
    const previousWorkspace = await getPreviousWorkspace(queryOptions.queryKey);

    // Optimistically update to the new value
    if (previousWorkspace) {
      queryClient.setQueryData<GetWorkspaceResponse>(queryOptions.queryKey, (old) => {
        if (!old) {
          return undefined;
        }

        const updatedLabels = [...old.labels, newLabel];

        return {
          ...old,
          labels: updatedLabels,
        };
      });
    }

    // Return a context object with the snapshotted value
    return { previousWorkspace, optimisticId };
  },
  onSuccess: (createdLabel, { workspaceSlug, orgIdOrSlug }, { optimisticId }) => {
    const queryOptions = workspaceQueryOptions(workspaceSlug, orgIdOrSlug);

    queryClient.setQueryData<GetWorkspaceResponse>(queryOptions.queryKey, (oldData) => {
      if (!oldData) {
        return undefined;
      }

      const updatedLabels = oldData.labels.map((label) => {
        if (label.id === optimisticId) {
          return createdLabel;
        }
        return label;
      });

      return {
        ...oldData,
        labels: updatedLabels,
      };
    });
    toast.success(t('common:success.create_resource', { resource: t('app:task') }));
  },
  onError,
});

queryClient.setMutationDefaults(labelKeys.update(), {
  mutationFn: updateLabel,
  onMutate: async (variables: LabelsUpdateMutationQueryFnVariables) => {
    const { orgIdOrSlug, workspaceSlug } = variables;
    const queryOptions = workspaceQueryOptions(workspaceSlug, orgIdOrSlug);
    const previousWorkspace = await getPreviousWorkspace(queryOptions.queryKey);

    // Optimistically update to the new value
    if (previousWorkspace) {
      queryClient.setQueryData<GetWorkspaceResponse>(queryOptions.queryKey, (old) => {
        if (!old) {
          return undefined;
        }

        const updatedLabels = old.labels.map((label) => {
          if (label.id === variables.id) {
            return {
              ...label,
              ...variables,
            };
          }
          return label;
        });

        return {
          ...old,
          labels: updatedLabels,
        };
      });
    }

    // Return a context object with the snapshotted value
    return { previousWorkspace };
  },
  onError,
});
