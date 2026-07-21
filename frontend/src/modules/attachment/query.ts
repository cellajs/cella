import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { infiniteQueryOptions, queryOptions, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { type Attachment, type GetAttachmentsData, getAttachment, getAttachments } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { appConfig } from 'shared';
import { selectRecentActivity } from '~/modules/attachment/helpers/activity-feed';
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
import { toaster } from '~/modules/common/toaster/toaster';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, cacheUpdate } from '~/query/basic/cache-mutations';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys, SYNC_CHUNK_SIZE } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { baseInfiniteQueryOptions } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation, removePendingMutations } from '~/query/basic/invalidation-helpers';
import { syncStaleTime } from '~/query/basic/sync-stale-config';
import type { ItemData } from '~/query/basic/types';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { type PreparedVars, usePreparedMutation } from '~/query/offline/prepared-mutation';
import { removePausedCreates, squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
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

/**
 * Org-level "recent activity" feed, the template proof of the view pattern: an aggregate
 * feed is a SELECT over the canonical home-list query, not an endpoint. Rows from every home
 * channel in the org interleave by recency, and sync (SSE + covering delta fetches) keeps the
 * underlying list fresh. Forks with deeper hierarchies get sub-org feeds the same way: the
 * grant-boundary views declared from memberships provide the change detection, the canonical
 * queries provide the rows, and a select like this provides the feed.
 */
export function useAttachmentActivityFeed(tenantId: string, organizationId: string, limit = 20) {
  const { data } = useQuery({
    ...attachmentsCanonicalOptions({ organizationId, tenantId }),
    select: (data) => selectRecentActivity(data.items, limit),
  });
  return data ?? [];
}

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
): UseMutationOptions<CreateData, Error, CreateAttachmentVars, { optimisticAttachments: ItemData[] }> => ({
  mutationKey: keys.create,
  scope: { id: 'attachment' },
  mutationFn: createAttachmentsMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ organizationId, data }) => {
    const orgKey = keys.list.org(organizationId);
    await queryClient.cancelQueries({ queryKey: orgKey });
    // Optimistic rows keep their pre-upload id (also the local blob key); insert into the canonical
    // home list only, never filtered/search lists.
    const optimisticAttachments = data.map((att) => createOptimisticEntity(zAttachment, att));
    insertEntitiesIntoHome(queryClient, {
      entityType: 'attachment',
      entities: optimisticAttachments,
      keys,
      organizationId,
    });
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
    // Upsert into the canonical home (updates in place if a concurrent SSE already inserted it).
    insertEntitiesIntoHome(queryClient, {
      entityType: 'attachment',
      entities: result.data,
      keys,
      organizationId: variables.organizationId,
    });
  },
  // Error-only: onSuccess patches cache, SSE handles other users.
  onSettled: (_data, error, variables) => {
    if (error)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.org(variables.organizationId));
  },
});

const attachmentUpdateOptions = (
  queryClient: QueryClient,
): UseMutationOptions<UpdateData, Error, UpdateAttachmentFullVars, { previousAttachment: Attachment | undefined }> => ({
  mutationKey: keys.update,
  // Same scope as create/delete: attachment writes serialize, so a squashed update never replays before its paused create.
  scope: { id: 'attachment' },
  mutationFn: updateAttachmentMutationFn,
  meta: { suppressGlobalErrorToast: true },
  // Squash/coalesce runs in the hook's prepare step, so variables already carry the merge; onMutate keeps only cache work.
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
    removePendingMutations(
      queryClient,
      keys.update,
      attachments.map((a) => a.id),
    );
    await queryClient.cancelQueries({ queryKey: orgKey });
    cacheRemove(orgKey, attachments);
    for (const { id } of attachments) queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
    return { deletedAttachments: attachments };
  },
  onError: (_err, variables, context) => {
    handleError('delete');
    if (context?.deletedAttachments) {
      insertEntitiesIntoHome(queryClient, {
        entityType: 'attachment',
        entities: context.deletedAttachments,
        keys,
        organizationId: variables.organizationId,
      });
    }
  },
  onSuccess: (result, variables) => {
    // Partial rejection (200 + rejectedIds): backend kept permission-denied rows; restore them to the
    // home list so they don't reappear on next sync, and notify. A full rejection arrives as a 403 via onError.
    const rejectedIds = result?.rejectedIds ?? [];
    if (rejectedIds.length === 0) return;
    const rejectedSet = new Set(rejectedIds);
    insertEntitiesIntoHome(queryClient, {
      entityType: 'attachment',
      entities: variables.attachments.filter((a) => rejectedSet.has(a.id)),
      keys,
      organizationId: variables.organizationId,
    });
    toaster(
      i18n.t('c:resources_delete_denied', { count: rejectedIds.length, total: variables.attachments.length }),
      'info',
    );
  },
  // Error-only: onMutate removed the attachment from all caches, SSE handles other users.
  onSettled: (_data, error, variables) => {
    if (error)
      invalidateIfLastMutation(queryClient, attachmentsMutationKeyBase, keys.list.org(variables.organizationId));
  },
});

export const useAttachmentCreateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  // Inject org context + stx so a replay reuses the original mutation id and timestamps; callers pass just the data.
  return usePreparedMutation<
    CreateData,
    Error,
    CreateAttachmentVars,
    { optimisticAttachments: ItemData[] },
    CreateAttachmentInput
  >(attachmentCreateOptions(queryClient), (data) => ({
    kind: 'run',
    vars: { tenantId, organizationId, data, stx: createStxForCreate() },
  }));
};

export const useAttachmentUpdateMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();

  /**
   * Squash/coalesce before the mutation exists so the request carries the merge. Folding into a
   * queued create issues no update and patches the optimistic row here (onMutate won't run).
   */
  const prepare = ({ id, ops }: UpdateAttachmentVars): PreparedVars<UpdateAttachmentFullVars> => {
    if (squashIntoPendingCreate(queryClient, keys.create, id, ops as Record<string, unknown>)) {
      const cached = findAttachmentInCache(id);
      if (cached) {
        const optimisticAttachment = { ...cached, ...ops, updatedAt: new Date().toISOString() };
        cacheUpdate(keys.list.org(organizationId), [optimisticAttachment]);
        queryClient.setQueryData(keys.detail.byId(id), optimisticAttachment);
      }
      return { kind: 'coalesced' };
    }
    // Coalesce queued offline edits; squashPendingMutation keeps each inherited field's original
    // timestamp so LWW arbitrates by intent time, and only the changed fields carry this edit's stamps.
    const newStx = createStxForUpdate(Object.keys(ops));
    const { ops: mergedOps, stx } = squashPendingMutation(
      queryClient,
      keys.update,
      id,
      ops as Record<string, unknown>,
      newStx,
    );
    return { kind: 'run', vars: { tenantId, organizationId, id, ops: mergedOps, stx } };
  };

  return usePreparedMutation<
    UpdateData,
    Error,
    UpdateAttachmentFullVars,
    { previousAttachment: Attachment | undefined },
    UpdateAttachmentVars
  >(attachmentUpdateOptions(queryClient), prepare);
};

export const useAttachmentDeleteMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();

  /**
   * Cancel queued creates for rows deleted while offline (they never reached the server), clear their
   * queued updates, finish deletion cache-side, and keep them out of the request. `noop` when nothing remains.
   */
  const prepare = (attachments: Attachment[]): PreparedVars<DeleteAttachmentVars> => {
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
      cacheRemove(keys.list.org(organizationId), localOnly);
      for (const { id } of localOnly) queryClient.removeQueries({ queryKey: keys.detail.byId(id) });
    }
    const remaining = attachments.filter((a) => !cancelled.has(a.id));
    if (remaining.length === 0) return { kind: 'noop' };
    return { kind: 'run', vars: { tenantId, organizationId, attachments: remaining, stx: createStxForDelete() } };
  };

  return usePreparedMutation<
    DeleteData,
    Error,
    DeleteAttachmentVars,
    { deletedAttachments: Attachment[] },
    Attachment[]
  >(attachmentDeleteOptions(queryClient), prepare);
};

// --- Mutation defaults (offline persistence) ---

addMutationRegistrar((queryClient: QueryClient) => {
  // Detail defaults for SSE handlers: resolve org/tenant from meta, then the cached entity, then the router.
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

  // The SAME full options the hooks use (not just mutationFn), so a replayed mutation runs the same reconciliation callbacks.
  queryClient.setMutationDefaults(keys.create, attachmentCreateOptions(queryClient));
  queryClient.setMutationDefaults(keys.update, attachmentUpdateOptions(queryClient));
  queryClient.setMutationDefaults(keys.delete, attachmentDeleteOptions(queryClient));
});
