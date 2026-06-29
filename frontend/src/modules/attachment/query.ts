import {
  infiniteQueryOptions,
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  type Attachment,
  type CreateAttachmentsData,
  createAttachments,
  deleteAttachments,
  type GetAttachmentsData,
  getAttachment,
  getAttachments,
  type UpdateAttachmentData,
  updateAttachment,
} from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import {
  baseInfiniteQueryOptions,
  createCacheFinder,
  createEntityKeys,
  createOptimisticEntity,
  fetchAllPages,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  removePendingMutations,
} from '~/query/basic';
import { cacheCreate, cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import { addMutationRegistrar } from '~/query/mutation-registry';
import {
  coalescePendingCreate,
  createStxForCreate,
  createStxForDelete,
  createStxForUpdate,
  mergeServerResponse,
  squashPendingMutation,
  syncEntityToCache,
} from '~/query/offline';
import { getCacheToken } from '~/query/realtime';
import { getRouteOrgId, getRouteTenantId } from '~/query/realtime/sync-priority';
import type { QueryOrgContext } from '~/query/types';
import { createResourceError } from '~/utils/resource-error';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
type CreateAttachmentInput = Omit<CreateAttachmentItem, 'stx'>[];
type UpdateAttachmentItem = UpdateAttachmentData['body'];
type UpdateAttachmentFields = UpdateAttachmentItem['ops'];
type UpdateAttachmentVars = { id: string; ops: UpdateAttachmentFields };

const attachmentsLimit = appConfig.requestLimits.attachments;

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
registerEntityQueryKeys('attachment', keys, (organizationId, tenantId, seqCursor, options) => {
  return getAttachments({
    path: { tenantId: tenantId!, organizationId: organizationId! },
    query: { seqCursor, limit: '1000' },
    headers: options?.cacheToken ? { 'x-cache-token': options.cacheToken } : undefined,
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
  const {
    tenantId,
    organizationId,
    q = '',
    sort = 'createdAt',
    order = 'desc',
    limit: baseLimit = attachmentsLimit,
  } = params;

  const limit = String(baseLimit);
  const keyFilters = { q, sort, order };
  const queryKey = keys.list.filtered(organizationId, keyFilters);
  const baseQuery = { q, sort, order, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getAttachments({
        path: { tenantId, organizationId },
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
    meta: { persist: false },
    staleTime: syncStaleTime,
  });
};

/**
 * Canonical attachment query — one flat query per organization scope.
 * Fetches all attachments for the org, stored at keys.list.org(organizationId).
 * Consumers derive views via select() for groupId filtering.
 * Sync (SSE + delta fetch) keeps this fresh; staleTime follows sync liveness.
 */
export const attachmentsCanonicalOptions = ({
  organizationId,
  tenantId,
}: {
  organizationId: string;
  tenantId: string;
}) => {
  return queryOptions({
    queryKey: keys.list.org(organizationId),
    queryFn: async () => {
      return fetchAllPages(
        ({ limit, offset }) =>
          getAttachments({
            path: { tenantId, organizationId },
            query: { limit, offset },
          }),
        1000,
      );
    },
    staleTime: syncStaleTime,
  });
};

export const attachmentQueryOptions = (tenantId: string, organizationId: string, id: string) => ({
  queryKey: keys.detail.byId(id),
  queryFn: async () => {
    const cacheToken = getCacheToken('attachment', id);
    return getAttachment({
      path: { tenantId, organizationId, id },
      headers: cacheToken ? { 'X-Cache-Token': cacheToken } : undefined,
    });
  },
  initialData: () => findAttachmentInCache(id),
});

export const findAttachmentInCache = createCacheFinder<Attachment>('attachment');

/** Get all attachments matching a groupId, subscribes to canonical query. */
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

// --- Mutations ---

export const useAttachmentCreateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  return useMutation({
    mutationKey: keys.create,
    scope: { id: 'attachment' },
    mutationFn: async (data: CreateAttachmentInput) => {
      const stx = createStxForCreate();
      const body = data.map((item) => ({ ...item, stx }));
      return createAttachments({ path: { tenantId, organizationId }, body });
    },
    onMutate: async (newAttachments) => {
      await queryClient.cancelQueries({ queryKey: orgKey });
      // Attachments already have IDs from Transloadit — preserved in optimistic entity
      const optimisticAttachments = newAttachments.map((att) => createOptimisticEntity(zAttachment, att));
      cacheCreate(orgKey, optimisticAttachments);
      return { optimisticAttachments };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _newData, context) => {
      handleError('create');
      if (context?.optimisticAttachments) cacheRemove(orgKey, context.optimisticAttachments);
    },
    onSuccess: (result, _variables, context) => {
      if (context?.optimisticAttachments) cacheRemove(orgKey, context.optimisticAttachments);
      // Upsert to avoid duplicates from concurrent SSE + onSuccess race
      for (const attachment of result.data) {
        if (findAttachmentInCache(attachment.id)) cacheUpdate(orgKey, [attachment]);
        else cacheCreate(orgKey, [attachment]);
      }
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, orgKey);
    },
  });
};

export const useAttachmentUpdateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  return useMutation({
    mutationKey: keys.update,
    mutationFn: async ({ id, ops }: UpdateAttachmentVars) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updateAttachment({ path: { tenantId, organizationId, id }, body: { ops, stx } });
    },
    onMutate: async ({ id, ops }: UpdateAttachmentVars) => {
      // If there's a pending create for this entity, fold update ops into it
      if (coalescePendingCreate(queryClient, keys.create, id, ops as Record<string, unknown>)) {
        return { coalesced: true };
      }

      const mergedOps = squashPendingMutation(queryClient, keys.update, id, ops as Record<string, unknown>);
      await queryClient.cancelQueries({ queryKey: orgKey });
      await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

      const previousAttachment = findAttachmentInCache(id);
      if (previousAttachment) {
        const optimisticAttachment = { ...previousAttachment, ...mergedOps, updatedAt: new Date().toISOString() };
        cacheUpdate(orgKey, [optimisticAttachment]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
      }
      return { previousAttachment };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _variables, context) => {
      handleError('update');
      if (context?.previousAttachment) {
        cacheUpdate(orgKey, [context.previousAttachment]);
        queryClient.setQueryData(keys.detail.byId(context.previousAttachment.id), context.previousAttachment);
      }
    },
    onSuccess: (updatedAttachment, variables) => {
      const detailKey = keys.detail.byId(updatedAttachment.id);
      const cached = findAttachmentInCache(updatedAttachment.id);
      const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
      const merged = mergeServerResponse({ cached, serverEntity: updatedAttachment, mutatedKeys });
      syncEntityToCache({ entity: merged, listKey: orgKey, detailKey, queryClient });
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, orgKey);
    },
  });
};

export const useAttachmentDeleteMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  return useMutation({
    mutationKey: keys.delete,
    scope: { id: 'attachment' },
    mutationFn: async (attachments: Attachment[]) => {
      const ids = attachments.map((a) => a.id);
      const stx = createStxForDelete();
      await deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx } });
    },
    onMutate: async (attachmentsToDelete) => {
      removePendingMutations(
        queryClient,
        keys.update,
        attachmentsToDelete.map((a) => a.id),
      );
      await queryClient.cancelQueries({ queryKey: orgKey });
      cacheRemove(orgKey, attachmentsToDelete);
      for (const { id } of attachmentsToDelete) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
      }
      return { deletedAttachments: attachmentsToDelete };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _attachments, context) => {
      handleError('delete');
      if (context?.deletedAttachments) cacheCreate(orgKey, context.deletedAttachments);
    },
    // Error-only: onMutate removed from all caches, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, orgKey);
    },
  });
};

// --- Mutation defaults (offline persistence) ---

addMutationRegistrar((queryClient: QueryClient) => {
  // Detail query defaults for SSE stream handlers — resolves organizationId/tenantId from:
  // 1. meta (SSE handler), 2. cached entity, 3. router context
  queryClient.setQueryDefaults(keys.detail.base, {
    queryFn: ({ queryKey, meta }) => {
      const id = queryKey[2] as string;
      const cacheToken = getCacheToken('attachment', id);
      const cached = findAttachmentInCache(id);
      const organizationId = (meta?.organizationId as string) ?? cached?.organizationId ?? getRouteOrgId();
      const tenantId = (meta?.tenantId as string) ?? cached?.tenantId ?? getRouteTenantId();
      if (!organizationId || !tenantId) throw new Error('Cannot resolve organizationId/tenantId for attachment fetch');
      return getAttachment({
        path: { id, organizationId, tenantId },
        headers: cacheToken ? { 'X-Cache-Token': cacheToken } : undefined,
      });
    },
  });

  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async ({ tenantId, organizationId, data }: QueryOrgContext & { data: CreateAttachmentInput }) => {
      const stx = createStxForCreate();
      const body = data.map((item) => ({ ...item, stx }));
      return createAttachments({ path: { tenantId, organizationId }, body });
    },
  });

  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ tenantId, organizationId, id, ops }: UpdateAttachmentVars & QueryOrgContext) => {
      const scalarFieldNames = ops ? Object.keys(ops) : [];
      const stx = createStxForUpdate(scalarFieldNames);
      return updateAttachment({ path: { tenantId, organizationId, id }, body: { ops, stx } });
    },
  });

  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async ({ tenantId, organizationId, attachments }: QueryOrgContext & { attachments: Attachment[] }) => {
      const ids = attachments.map((a) => a.id);
      const stx = createStxForDelete();
      await deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx } });
    },
  });
});
