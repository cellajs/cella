import {
  infiniteQueryOptions,
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import { appConfig } from 'shared';
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
} from '~/api.gen';
import { zAttachment } from '~/api.gen/zod.gen';
import {
  baseInfiniteQueryOptions,
  createEntityKeys,
  createOptimisticEntity,
  findEntityInListCache,
  invalidateIfLastMutation,
  registerEntityQueryKeys,
  syncStaleTime,
  useMutateQueryData,
} from '~/query/basic';
import { addMutationRegistrar } from '~/query/mutation-registry';
import {
  createStxForCreate,
  createStxForDelete,
  createStxForUpdate,
  squashPendingMutation,
  syncEntityToCache,
} from '~/query/offline';
import { queryClient } from '~/query/query-client';
import { getCacheToken } from '~/query/realtime';
import { getRouteOrgId, getRouteTenantId } from '~/query/realtime/sync-priority';
import type { QueryOrgContext } from '~/query/types';
import { createResourceError } from '~/utils/resource-error';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
type CreateAttachmentInput = Omit<CreateAttachmentItem, 'stx'>[];
type UpdateAttachmentItem = UpdateAttachmentData['body'];
type UpdateAttachmentInput = Omit<UpdateAttachmentItem, 'stx'>;
type UpdateAttachmentVars = { id: string; key: UpdateAttachmentInput['key']; data: UpdateAttachmentInput['data'] };

const attachmentsLimit = appConfig.requestLimits.attachments;

type AttachmentFilters = Omit<GetAttachmentsData['query'], 'limit' | 'offset'> & {
  tenantId: string;
  orgId: string;
};

const keys = createEntityKeys<AttachmentFilters>('attachment');
registerEntityQueryKeys('attachment', keys);
export const attachmentQueryKeys = keys;

const attachmentsMutationKeyBase = ['attachment'] as const;
const handleError = createResourceError('attachment');

type AttachmentsListParams = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset'> & {
  tenantId: string;
  orgId: string;
  limit?: number;
};

export const attachmentsListQueryOptions = (params: AttachmentsListParams) => {
  const { tenantId, orgId, q = '', sort = 'createdAt', order = 'desc', limit: baseLimit = attachmentsLimit } = params;

  const limit = String(baseLimit);
  const keyFilters = { tenantId, orgId, q, sort, order };
  const queryKey = keys.list.filtered(keyFilters);
  const baseQuery = { q, sort, order, limit };

  return infiniteQueryOptions({
    queryKey,
    queryFn: async ({ pageParam: { page, offset: _offset }, signal }) => {
      const offset = String(_offset ?? (page ?? 0) * Number(limit));

      const result = await getAttachments({
        path: { tenantId, orgId },
        query: { ...baseQuery, offset },
        signal,
      });

      return result;
    },
    ...baseInfiniteQueryOptions,
    staleTime: syncStaleTime,
  });
};

export const attachmentQueryOptions = (tenantId: string, orgId: string, id: string) => ({
  queryKey: keys.detail.byId(id),
  queryFn: async () => {
    const cacheToken = getCacheToken('attachment', id);
    return getAttachment({
      path: { tenantId, orgId, id },
      headers: cacheToken ? { 'X-Cache-Token': cacheToken } : undefined,
    });
  },
  initialData: () => findAttachmentInListCache(id),
});

export const findAttachmentInListCache = (id: string) => findEntityInListCache<Attachment>('attachment', id);

export const findAttachmentInCache = (id: string): Attachment | undefined => {
  const detail = queryClient.getQueryData<Attachment>(keys.detail.byId(id));
  if (detail) return detail;
  return findEntityInListCache<Attachment>('attachment', id);
};

/** Get all attachments matching a groupId, subscribes to list query. */
export function useGroupAttachments(
  tenantId: string | undefined,
  orgId: string | undefined,
  groupId: string | undefined,
) {
  const queryOptions =
    tenantId && orgId ? attachmentsListQueryOptions({ tenantId, orgId, sort: 'createdAt', order: 'desc' }) : null;

  const { data } = useInfiniteQuery({
    ...queryOptions!,
    enabled: !!tenantId && !!orgId && !!groupId,
    select: (data) => {
      if (!groupId) return null;
      const allItems = data.pages.flatMap((page) => page.items);
      const filtered = allItems.filter((item) => item.groupId === groupId);
      return filtered.length > 0 ? filtered : null;
    },
  });

  return data ?? null;
}

// --- Mutations ---

export const useAttachmentCreateMutation = (tenantId: string, orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.create,
    scope: { id: 'attachment' },
    mutationFn: async (data: CreateAttachmentInput) => {
      const stx = createStxForCreate();
      const body = data.map((item) => ({ ...item, stx }));
      return createAttachments({ path: { tenantId, orgId }, body });
    },
    onMutate: async (newAttachments) => {
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      // Attachments already have IDs from Transloadit — preserved in optimistic entity
      const optimisticAttachments = newAttachments.map((att) => createOptimisticEntity(zAttachment, att));
      mutateCache.create(optimisticAttachments);
      return { optimisticAttachments };
    },
    onError: (_err, _newData, context) => {
      handleError('create');
      if (context?.optimisticAttachments) mutateCache.remove(context.optimisticAttachments);
    },
    onSuccess: (result, _variables, context) => {
      if (context?.optimisticAttachments) mutateCache.remove(context.optimisticAttachments);
      // Upsert to avoid duplicates from concurrent SSE + onSuccess race
      for (const attachment of result.data) {
        if (findAttachmentInCache(attachment.id)) mutateCache.update([attachment]);
        else mutateCache.create([attachment]);
      }
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

export const useAttachmentUpdateMutation = (tenantId: string, orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.update,
    scope: { id: 'attachment' },
    mutationFn: async ({ id, key, data }: UpdateAttachmentVars) => {
      const cachedEntity = findAttachmentInListCache(id);
      const stx = createStxForUpdate(cachedEntity);
      return updateAttachment({ path: { tenantId, orgId, id }, body: { key, data, stx } });
    },
    onMutate: async ({ id, key, data }: UpdateAttachmentVars) => {
      await squashPendingMutation(queryClient, keys.update, id, { [key]: data });
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

      const previousAttachment = findAttachmentInListCache(id);
      if (previousAttachment) {
        const optimisticAttachment = { ...previousAttachment, [key]: data, modifiedAt: new Date().toISOString() };
        mutateCache.update([optimisticAttachment]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
      }
      return { previousAttachment };
    },
    onError: (_err, _variables, context) => {
      handleError('update');
      if (context?.previousAttachment) {
        mutateCache.update([context.previousAttachment]);
        queryClient.setQueryData(keys.detail.byId(context.previousAttachment.id), context.previousAttachment);
      }
    },
    onSuccess: (updatedAttachment, variables) => {
      const detailKey = keys.detail.byId(updatedAttachment.id);
      const cached = findAttachmentInListCache(updatedAttachment.id);
      // Merge only the mutated field + stx from server, preserving other optimistic values
      const merged = cached
        ? {
            ...cached,
            [variables.key]: updatedAttachment[variables.key],
            stx: updatedAttachment.stx,
            modifiedAt: updatedAttachment.modifiedAt,
            ...('modifiedBy' in updatedAttachment ? { modifiedBy: updatedAttachment.modifiedBy } : {}),
          }
        : updatedAttachment;
      syncEntityToCache({ entity: merged, detailKey, mutateCache, queryClient });
    },
    // Error-only: onSuccess patches cache, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

export const useAttachmentDeleteMutation = (tenantId: string, orgId: string) => {
  const queryClient = useQueryClient();
  const mutateCache = useMutateQueryData(keys.list.base);

  return useMutation({
    mutationKey: keys.delete,
    scope: { id: 'attachment' },
    mutationFn: async (attachments: Attachment[]) => {
      const ids = attachments.map((a) => a.id);
      const stx = createStxForDelete();
      await deleteAttachments({ path: { tenantId, orgId }, body: { ids, stx } });
    },
    onMutate: async (attachmentsToDelete) => {
      await queryClient.cancelQueries({ queryKey: keys.list.base });
      mutateCache.remove(attachmentsToDelete);
      for (const { id } of attachmentsToDelete) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
      }
      return { deletedAttachments: attachmentsToDelete };
    },
    onError: (_err, _attachments, context) => {
      handleError('delete');
      if (context?.deletedAttachments) mutateCache.create(context.deletedAttachments);
    },
    // Error-only: onMutate removed from all caches, SSE handles other users
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.base);
    },
  });
};

// --- Mutation defaults (offline persistence) ---

addMutationRegistrar((queryClient: QueryClient) => {
  // Detail query defaults for SSE stream handlers — resolves orgId/tenantId from:
  // 1. meta.organizationId (SSE handler), 2. cached entity, 3. router context
  // TODO can we consider a way that tenantId and orgID are already available here?
  queryClient.setQueryDefaults(keys.detail.base, {
    queryFn: ({ queryKey, meta }) => {
      const id = queryKey[2] as string;
      const cacheToken = getCacheToken('attachment', id);
      const cached = findAttachmentInCache(id);
      const orgId = (meta?.organizationId as string) ?? cached?.organizationId ?? getRouteOrgId();
      const tenantId = cached?.tenantId ?? getRouteTenantId();
      if (!orgId || !tenantId) throw new Error('Cannot resolve orgId/tenantId for attachment fetch');
      return getAttachment({
        path: { id, orgId, tenantId },
        headers: cacheToken ? { 'X-Cache-Token': cacheToken } : undefined,
      });
    },
  });

  queryClient.setMutationDefaults(keys.create, {
    mutationFn: async ({ tenantId, orgId, data }: QueryOrgContext & { data: CreateAttachmentInput }) => {
      const stx = createStxForCreate();
      const body = data.map((item) => ({ ...item, stx }));
      return createAttachments({ path: { tenantId, orgId }, body });
    },
  });

  queryClient.setMutationDefaults(keys.update, {
    mutationFn: async ({ tenantId, orgId, id, key, data }: UpdateAttachmentVars & QueryOrgContext) => {
      const cachedEntity = findAttachmentInListCache(id);
      const stx = createStxForUpdate(cachedEntity);
      return updateAttachment({ path: { tenantId, orgId, id }, body: { key, data, stx } });
    },
  });

  queryClient.setMutationDefaults(keys.delete, {
    mutationFn: async ({ tenantId, orgId, attachments }: QueryOrgContext & { attachments: Attachment[] }) => {
      const ids = attachments.map((a) => a.id);
      const stx = createStxForDelete();
      await deleteAttachments({ path: { tenantId, orgId }, body: { ids, stx } });
    },
  });
});
