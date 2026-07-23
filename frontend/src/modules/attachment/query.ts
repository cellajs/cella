import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { infiniteQueryOptions, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { type Attachment, type GetAttachmentsData, getAttachment, getAttachments } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { selectRecentActivity } from '~/modules/attachment/helpers/activity-feed';
import type {
  CreateAttachmentInput,
  CreateAttachmentVars,
  DeleteAttachmentVars,
  UpdateAttachmentFullVars,
  UpdateAttachmentVars,
} from '~/modules/attachment/query-mutations';
import {
  createAttachmentsMutationFn,
  deleteAttachmentsMutationFn,
  updateAttachmentMutationFn,
} from '~/modules/attachment/query-mutations';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { toaster } from '~/modules/common/toaster/toaster';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, cacheUpdate, removeDetailQueriesById } from '~/query/basic/cache-mutations';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys, SYNC_CHUNK_SIZE } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation, removePendingMutations } from '~/query/basic/invalidation-helpers';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import type { OrgRoutableItemData } from '~/query/basic/types';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { buildPreparedHandlers, type PreparedVars } from '~/query/offline/prepared-mutation';
import { removePausedCreates, squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import { mergeServerResponse, syncEntityToCache } from '~/query/offline/update-success-utils';
import { resolveQueryOrgTenantIds } from '~/query/realtime/sync-priority';
import { createResourceError } from '~/utils/resource-error';

type AttachmentFilters = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'>;

const baseKeys = createEntityKeys<AttachmentFilters>('attachment');
const keys = {
  ...baseKeys,
  list: {
    ...baseKeys.list,
    filtered: (organizationId: string, filters: AttachmentFilters) =>
      ['attachment', 'list', organizationId, filters] as const,
  },
};
registerEntityQueryKeys('attachment', keys, (organizationId, tenantId, seqCursor) => {
  return getAttachments({
    path: { tenantId: tenantId!, organizationId: organizationId! },
    query: { seqCursor, limit: String(SYNC_CHUNK_SIZE) },
  });
});
export const attachmentQueryKeys = keys;

const attachmentsMutationKeyBase = ['attachment'] as const;
const handleError = createResourceError('attachment');

type AttachmentsListParams = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'> & {
  tenantId: string;
  organizationId: string;
  limit?: number;
};

export const attachmentsListQueryOptions = (params: AttachmentsListParams) => {
  const defaults = attachmentsSearchDefaults;

  const {
    tenantId,
    organizationId,
    q = defaults.q,
    sort = defaults.sort,
    order = defaults.order,
    limit = appConfig.requestLimits.attachments,
  } = params;

  const filters = { q, sort, order };
  const requestQuery = { ...filters, limit: String(limit) };

  return infiniteQueryOptions({
    queryKey: keys.list.filtered(organizationId, filters),
    queryFn: ({ pageParam: { page, offset }, signal }) => {
      const requestOffset = String(offset ?? (page ?? 0) * limit);

      return getAttachments({
        path: { tenantId, organizationId },
        query: { ...requestQuery, offset: requestOffset },
        signal,
      });
    },
    ...baseInfiniteQueryOptions,
    meta: { persist: false },
    staleTime: syncStaleTime,
  });
};

export const attachmentsCanonicalOptions = ({
  organizationId,
  tenantId,
}: {
  organizationId: string;
  tenantId: string;
}) => {
  return queryOptions({
    queryKey: keys.list.home(organizationId),
    queryFn: async () => {
      return fetchAllPages(
        ({ limit, offset }) => getAttachments({ path: { tenantId, organizationId }, query: { limit, offset } }),
        1000,
      );
    },
    staleTime: syncStaleTime,
  });
};

export const attachmentQueryOptions = (tenantId: string, organizationId: string, id: string) => ({
  queryKey: keys.detail.byId(id),
  queryFn: () => getAttachment({ path: { tenantId, organizationId, id } }),
  initialData: () => findAttachmentInCache(id),
});

export const findAttachmentInCache = createCacheFinder<Attachment>('attachment');

export function useAttachmentActivityFeed(tenantId: string, organizationId: string, limit = 20) {
  const { data } = useQuery({
    ...attachmentsCanonicalOptions({ organizationId, tenantId }),
    select: (data) => selectRecentActivity(data.items, limit),
  });
  return data ?? [];
}

export function useGroupAttachments(
  tenantId: string | undefined,
  organizationId: string | undefined,
  groupId: string | undefined,
) {
  const { data } = useQuery({
    ...attachmentsCanonicalOptions({ organizationId: organizationId!, tenantId: tenantId! }),
    enabled: !!tenantId && !!organizationId && !!groupId,
    select: (data) => {
      if (!groupId) return null;
      const filtered = data.items.filter((item) => item.groupId === groupId);
      return filtered.length > 0 ? filtered : null;
    },
  });

  return data ?? null;
}

type CreateData = Awaited<ReturnType<typeof createAttachmentsMutationFn>>;
type UpdateData = Awaited<ReturnType<typeof updateAttachmentMutationFn>>;
type DeleteData = Awaited<ReturnType<typeof deleteAttachmentsMutationFn>>;

/**
 * Full options for one attachment op, shared by the live hook and the offline-replay defaults so a
 * replay reconciles like the live one. Callbacks take the QueryClient explicitly and derive the org
 * key from durable variables. On replay onMutate does not re-run, so onSettled invalidation recovers.
 */
const attachmentCreateOptions = (
  queryClient: QueryClient,
): UseMutationOptions<CreateData, Error, CreateAttachmentVars, { optimisticAttachments: OrgRoutableItemData[] }> => ({
  mutationKey: keys.create,
  scope: { id: 'attachment' },
  mutationFn: createAttachmentsMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ organizationId, data }) => {
    const orgKey = keys.list.org(organizationId);
    await queryClient.cancelQueries({ queryKey: orgKey });
    const optimisticAttachments = data.map((att) => createOptimisticEntity(zAttachment, { ...att, organizationId }));
    insertEntitiesIntoHome(queryClient, optimisticAttachments);
    return { optimisticAttachments };
  },
  onError: (_err, variables, context) => {
    handleError('create');
    if (context?.optimisticAttachments)
      cacheRemove(keys.list.org(variables.organizationId), context.optimisticAttachments);
  },
  onSuccess: (result, variables, context) => {
    const orgKey = keys.list.org(variables.organizationId);
    if (context?.optimisticAttachments) cacheRemove(orgKey, context.optimisticAttachments);
    insertEntitiesIntoHome(queryClient, result.data);
  },
  onSettled: (_data, error, variables) => {
    if (error)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.org(variables.organizationId));
  },
});

const attachmentUpdateOptions = (
  queryClient: QueryClient,
): UseMutationOptions<UpdateData, Error, UpdateAttachmentFullVars, { previousAttachment: Attachment | undefined }> => ({
  mutationKey: keys.update,
  scope: { id: 'attachment' },
  mutationFn: updateAttachmentMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ organizationId, id, ops }) => {
    const orgKey = keys.list.org(organizationId);
    await queryClient.cancelQueries({ queryKey: orgKey });
    await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

    const previousAttachment = findAttachmentInCache(id);
    if (previousAttachment) {
      const optimisticAttachment = { ...previousAttachment, ...ops, updatedAt: new Date().toISOString() };
      cacheUpdate(orgKey, [optimisticAttachment]);
      queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
    }
    return { previousAttachment };
  },
  onError: (_err, variables, context) => {
    handleError('update');
    if (context?.previousAttachment) {
      cacheUpdate(keys.list.org(variables.organizationId), [context.previousAttachment]);
      queryClient.setQueryData(keys.detail.byId(context.previousAttachment.id), context.previousAttachment);
    }
  },
  onSuccess: (updatedAttachment, variables) => {
    const orgKey = keys.list.org(variables.organizationId);
    const detailKey = keys.detail.byId(updatedAttachment.id);
    const cached = findAttachmentInCache(updatedAttachment.id);
    const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
    const merged = mergeServerResponse({ cached, serverEntity: updatedAttachment, mutatedKeys });
    syncEntityToCache({ entity: merged, listKey: orgKey, detailKey, queryClient });
  },
  onSettled: (_data, error, variables) => {
    if (error)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.org(variables.organizationId));
  },
});

const attachmentDeleteOptions = (
  queryClient: QueryClient,
): UseMutationOptions<DeleteData, Error, DeleteAttachmentVars, { deletedAttachments: Attachment[] }> => ({
  mutationKey: keys.delete,
  scope: { id: 'attachment' },
  mutationFn: deleteAttachmentsMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ organizationId, attachments }) => {
    const orgKey = keys.list.org(organizationId);
    const attachmentIds = attachments.map((a) => a.id);
    removePendingMutations(queryClient, keys.update, attachmentIds);
    await queryClient.cancelQueries({ queryKey: orgKey });
    cacheRemove(orgKey, attachments);
    removeDetailQueriesById(queryClient, keys.detail.base, attachmentIds);
    return { deletedAttachments: attachments };
  },
  onError: (_err, _variables, context) => {
    handleError('delete');
    if (context?.deletedAttachments) {
      insertEntitiesIntoHome(queryClient, context.deletedAttachments);
    }
  },
  onSuccess: (result, variables) => {
    const rejectedIds = result?.rejectedIds ?? [];
    if (rejectedIds.length === 0) return;
    const rejectedSet = new Set(rejectedIds);
    const rejectedAttachments = variables.attachments.filter((a) => rejectedSet.has(a.id));
    insertEntitiesIntoHome(queryClient, rejectedAttachments);
    toaster.info(
      i18n.t('c:resources_delete_denied', { count: rejectedIds.length, total: variables.attachments.length }),
    );
  },
  onSettled: (_data, error, variables) => {
    if (error)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.org(variables.organizationId));
  },
});

export const useAttachmentCreateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation(attachmentCreateOptions(queryClient));

  const prepare = (data: CreateAttachmentInput): PreparedVars<CreateAttachmentVars> => ({
    kind: 'run',
    vars: { tenantId, organizationId, data, stx: createStxForCreate() },
  });

  return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
};

export const useAttachmentUpdateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation(attachmentUpdateOptions(queryClient));

  const prepare = ({ id, ops }: UpdateAttachmentVars): PreparedVars<UpdateAttachmentFullVars> => {
    if (squashIntoPendingCreate(queryClient, keys.create, id, ops)) {
      const cached = findAttachmentInCache(id);
      if (cached) {
        const optimisticAttachment = { ...cached, ...ops, updatedAt: new Date().toISOString() };
        cacheUpdate(keys.list.org(organizationId), [optimisticAttachment]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
      }
      return { kind: 'coalesced' };
    }

    const newStx = createStxForUpdate(Object.keys(ops));
    const { ops: mergedOps, stx } = squashPendingMutation(queryClient, keys.update, id, ops, newStx);
    return { kind: 'run', vars: { tenantId, organizationId, id, ops: mergedOps, stx } };
  };

  return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
};

/**
 * Delete mutation hook for attachments. This is a prepared mutation that can be used offline and will squash multiple deletes into one.
 */
export const useAttachmentDeleteMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation(attachmentDeleteOptions(queryClient));

  const prepare = (attachments: Attachment[]): PreparedVars<DeleteAttachmentVars> => {
    const attachmentIds = attachments.map(({ id }) => id);
    const cancelled = new Set(removePausedCreates(queryClient, keys.create, attachmentIds));

    if (cancelled.size > 0) {
      const localOnly = attachments.filter((a) => cancelled.has(a.id));
      const localOnlyIds = localOnly.map(({ id }) => id);
      removePendingMutations(queryClient, keys.update, localOnlyIds);
      cacheRemove(keys.list.org(organizationId), localOnly);
      removeDetailQueriesById(queryClient, keys.detail.base, localOnlyIds);
    }

    const remaining = attachments.filter((a) => !cancelled.has(a.id));
    if (remaining.length === 0) return { kind: 'noop' };
    return { kind: 'run', vars: { tenantId, organizationId, attachments: remaining, stx: createStxForDelete() } };
  };

  return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
};

// Mutation defaults (offline persistence)
addMutationRegistrar((queryClient: QueryClient) => {
  queryClient.setQueryDefaults(keys.detail.base, {
    queryFn: ({ queryKey, meta }) => {
      const id = queryKey[2] as string;
      const cached = findAttachmentInCache(id);
      const { organizationId, tenantId } = resolveQueryOrgTenantIds(meta, cached, 'attachment');
      return getAttachment({ path: { id, organizationId, tenantId } });
    },
  });

  queryClient.setMutationDefaults(keys.create, attachmentCreateOptions(queryClient));
  queryClient.setMutationDefaults(keys.update, attachmentUpdateOptions(queryClient));
  queryClient.setMutationDefaults(keys.delete, attachmentDeleteOptions(queryClient));
});
