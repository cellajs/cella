import type { QueryClient } from '@tanstack/react-query';
import { infiniteQueryOptions, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type Attachment, type GetAttachmentsData, getAttachment, getAttachments } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import {
  type CreateAttachmentInput,
  type CreateAttachmentVars,
  createAttachmentsMutationFn,
  type DeleteAttachmentVars,
  deleteAttachmentsMutationFn,
  type UpdateAttachmentFullVars,
  type UpdateAttachmentVars,
  updateAttachmentMutationFn,
} from '~/modules/attachment/query-mutations';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { cacheCreate, cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys, SYNC_CHUNK_SIZE } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation, removePendingMutations } from '~/query/basic/invalidation-helpers';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { removePausedCreates, squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';
import { mergeServerResponse, syncEntityToCache } from '~/query/offline/update-success-utils';
import { getRouteOrgId, getRouteTenantId } from '~/query/realtime/sync-priority';
import { createResourceError } from '~/utils/resource-error';

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
registerEntityQueryKeys('attachment', keys, (organizationId, tenantId, seqCursor, pathPrefix) => {
  return getAttachments({
    path: { tenantId: tenantId!, organizationId: organizationId! },
    query: { seqCursor, pathPrefix, limit: String(SYNC_CHUNK_SIZE) },
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
    q = attachmentsSearchDefaults.q,
    sort = attachmentsSearchDefaults.sort,
    order = attachmentsSearchDefaults.order,
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
 * Canonical attachment query: one flat home list per org (keys.list.home, since attachments are
 * org-homed), fetching all its attachments. Consumers derive views via select() for groupId
 * filtering. Sync (SSE + delta fetch) keeps it fresh; staleTime follows sync liveness.
 */
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
  queryFn: async () => getAttachment({ path: { tenantId, organizationId, id } }),
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
// The mutation functions live in ./query-mutations (shared with the offline-replay defaults).

export const useAttachmentCreateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  const mutation = useMutation({
    mutationKey: keys.create,
    scope: { id: 'attachment' },
    mutationFn: createAttachmentsMutationFn,
    onMutate: async ({ data }: CreateAttachmentVars) => {
      await queryClient.cancelQueries({ queryKey: orgKey });
      // Attachments are minted with an id before upload (`onBeforeFileAdded`), which the
      // optimistic entity preserves. That id also keys the local blob, so the optimistic row
      // can resolve its own bytes while the create is still in flight or paused offline.
      const optimisticAttachments = data.map((att) => createOptimisticEntity(zAttachment, att));
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

  // Inject org context so persisted variables replay correctly after a reload; callers pass just the data.
  return {
    ...mutation,
    mutate: (data: CreateAttachmentInput, options?: Parameters<typeof mutation.mutate>[1]) =>
      mutation.mutate({ tenantId, organizationId, data }, options),
    mutateAsync: (data: CreateAttachmentInput, options?: Parameters<typeof mutation.mutateAsync>[1]) =>
      mutation.mutateAsync({ tenantId, organizationId, data }, options),
  };
};

export const useAttachmentUpdateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  const mutation = useMutation({
    mutationKey: keys.update,
    // Same scope as create/delete: attachment writes serialize, so an update squashed past a
    // paused create can never replay before it (D6).
    scope: { id: 'attachment' },
    mutationFn: updateAttachmentMutationFn,
    // Squash/coalesce happens in the wrapped mutate() below, BEFORE this mutation exists, so
    // the request variables carry the merge; onMutate keeps only cache work.
    onMutate: async ({ id, ops }: UpdateAttachmentFullVars) => {
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

  /**
   * Pre-mutation squash/coalesce (D1/D2): runs before the mutation exists, so nothing
   * self-matches and the REQUEST carries the merge. Returns null when the edit was folded
   * into a paused create — the create replays with the merged fields and no update mutation
   * is issued; the optimistic row is patched here since onMutate never runs.
   */
  const prepareUpdate = ({ id, ops }: UpdateAttachmentVars): UpdateAttachmentVars | null => {
    if (squashIntoPendingCreate(queryClient, keys.create, id, ops as Record<string, unknown>)) {
      const cached = findAttachmentInCache(id);
      if (cached) {
        const optimisticAttachment = { ...cached, ...ops, updatedAt: new Date().toISOString() };
        cacheUpdate(orgKey, [optimisticAttachment]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
      }
      return null;
    }
    return { id, ops: squashPendingMutation(queryClient, keys.update, id, ops as Record<string, unknown>) };
  };

  return {
    ...mutation,
    mutate: (vars: UpdateAttachmentVars, options?: Parameters<typeof mutation.mutate>[1]) => {
      const prepared = prepareUpdate(vars);
      if (prepared) mutation.mutate({ tenantId, organizationId, ...prepared }, options);
    },
    mutateAsync: async (vars: UpdateAttachmentVars, options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const prepared = prepareUpdate(vars);
      return prepared ? mutation.mutateAsync({ tenantId, organizationId, ...prepared }, options) : undefined;
    },
  };
};

export const useAttachmentDeleteMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const orgKey = keys.list.org(organizationId);

  const mutation = useMutation({
    mutationKey: keys.delete,
    scope: { id: 'attachment' },
    mutationFn: deleteAttachmentsMutationFn,
    onMutate: async ({ attachments }: DeleteAttachmentVars) => {
      removePendingMutations(
        queryClient,
        keys.update,
        attachments.map((a) => a.id),
      );
      await queryClient.cancelQueries({ queryKey: orgKey });
      cacheRemove(orgKey, attachments);
      for (const { id } of attachments) {
        queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
      }
      return { deletedAttachments: attachments };
    },
    meta: { suppressGlobalErrorToast: true },
    onError: (_err, _attachments, context) => {
      handleError('delete');
      if (context?.deletedAttachments) cacheCreate(orgKey, context.deletedAttachments);
    },
    // Error-only: onMutate removed the attachment from all caches, SSE handles other users.
    onSettled: (_data, error) => {
      if (error) invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, orgKey);
    },
  });

  /**
   * Pre-mutation create cancellation (D3): rows with a paused create never reached the
   * server — cancel the create, clear their paused updates, finish their deletion
   * cache-side, and keep them OUT of the delete request. Returns the rows that still need
   * a server delete, or null when none do (including the empty-selection edge).
   */
  const prepareDelete = (attachments: Attachment[]): Attachment[] | null => {
    const cancelled = new Set(
      removePausedCreates(
        queryClient,
        keys.create,
        attachments.map((a) => a.id),
      ),
    );
    if (cancelled.size > 0) {
      const localOnly = attachments.filter((a) => cancelled.has(a.id));
      removePendingMutations(
        queryClient,
        keys.update,
        localOnly.map((a) => a.id),
      );
      cacheRemove(orgKey, localOnly);
      for (const { id } of localOnly) queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
    }
    const remaining = attachments.filter((a) => !cancelled.has(a.id));
    return remaining.length > 0 ? remaining : null;
  };

  return {
    ...mutation,
    mutate: (attachments: Attachment[], options?: Parameters<typeof mutation.mutate>[1]) => {
      const remaining = prepareDelete(attachments);
      if (remaining) mutation.mutate({ tenantId, organizationId, attachments: remaining }, options);
    },
    mutateAsync: async (attachments: Attachment[], options?: Parameters<typeof mutation.mutateAsync>[1]) => {
      const remaining = prepareDelete(attachments);
      return remaining
        ? mutation.mutateAsync({ tenantId, organizationId, attachments: remaining }, options)
        : undefined;
    },
  };
};

// --- Mutation defaults (offline persistence) ---

addMutationRegistrar((queryClient: QueryClient) => {
  // Detail query defaults for SSE stream handlers, resolves organizationId/tenantId from:
  // 1. meta (SSE handler), 2. cached entity, 3. router context
  queryClient.setQueryDefaults(keys.detail.base, {
    queryFn: ({ queryKey, meta }) => {
      const id = queryKey[2] as string;
      const cached = findAttachmentInCache(id);
      const organizationId = (meta?.organizationId as string) ?? cached?.organizationId ?? getRouteOrgId();
      const tenantId = (meta?.tenantId as string) ?? cached?.tenantId ?? getRouteTenantId();
      if (!organizationId || !tenantId) throw new Error('Cannot resolve organizationId/tenantId for attachment fetch');
      return getAttachment({ path: { id, organizationId, tenantId } });
    },
  });

  // Same functions the hooks use, so a mutation replayed from the persisted queue after a reload
  // (when the hook's closure is gone) runs identically to the live one.
  queryClient.setMutationDefaults(keys.create, { mutationFn: createAttachmentsMutationFn });
  queryClient.setMutationDefaults(keys.update, { mutationFn: updateAttachmentMutationFn });
  queryClient.setMutationDefaults(keys.delete, { mutationFn: deleteAttachmentsMutationFn });
});
