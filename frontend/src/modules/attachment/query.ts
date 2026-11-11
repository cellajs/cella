import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { infiniteQueryOptions, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { type Attachment, getAttachment, type ListAttachmentsData, listAttachments } from 'sdk';
import { zAttachment } from 'sdk/zod.gen';
import { appConfig, hierarchy } from 'shared';
import { deriveDocument } from 'shared/utils/derive-description-core';
import { clearStoredUploads, hasPendingUploads, isPendingUpload } from '~/modules/attachment/helpers/pending-uploads';
import type {
  CreateAttachmentInput,
  CreateAttachmentVars,
  DeleteAttachmentVars,
  UpdateAttachmentFullVars,
  UpdateAttachmentVars,
} from '~/modules/attachment/query-mutations';
import {
  attachmentCreateKeys,
  createAttachmentsMutationFn,
  deleteAttachmentsMutationFn,
  updateAttachmentMutationFn,
} from '~/modules/attachment/query-mutations';
import { attachmentsSearchDefaults } from '~/modules/attachment/search-params-schemas';
import { registerDescriptionDerivation } from '~/modules/common/blocknote/description-derivation';
import { registerDescriptionColumns } from '~/modules/common/blocknote/yjs-owned-fields';
import { toaster } from '~/modules/common/toaster/toaster';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, cacheUpdate, cancelKeepingMark, removeDetailQueriesById, writeKeepingMark } from '~/query/basic/cache-mutations';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys, syncChunkSize } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { liveItems, orderByParam, pageQuery, tokenPaging } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation, removePendingMutations } from '~/query/basic/invalidation-helpers';
import { syncStaleTime } from '~/query/basic/sync-stale-state';
import { syncedListOptions } from '~/query/basic/synced-list-options';
import type { OrgRoutableItemData } from '~/query/basic/types';
import { registerVariablesVersion } from '~/query/offline/mutation-variables';
import { prepareProductDelete } from '~/query/offline/prepare-delete';
import { buildPreparedHandlers, type PreparedVars } from '~/query/offline/prepared-mutation';
import { squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import { mergeServerResponse, writeEntityToCache } from '~/query/offline/update-success-utils';
import { queryClient } from '~/query/query-client';
import { resolveQueryOrgTenantIds } from '~/query/realtime/sync-priority';
import type { ListFilters } from '~/query/types';
import { createResourceError } from '~/utils/resource-error';

type AttachmentFilters = ListFilters<NonNullable<ListAttachmentsData['query']>>;

const baseKeys = createEntityKeys<AttachmentFilters>('attachment');
const keys = {
  ...baseKeys,
  list: {
    ...baseKeys.list,
    filtered: (organizationId: string, filters: AttachmentFilters) => ['attachment', 'list', organizationId, filters] as const,
  },
};
// A narrowed range fetch names the channel that covers the due views; org-wide passes none.
registerEntityQueryKeys('attachment', keys, ({ organizationId, tenantId, channelId, query }) => {
  return listAttachments({ path: { tenantId, organizationId }, query: { ...query, channelId } });
});
export const attachmentQueryKeys = keys;

// The columns `update-attachment.ts` stores from a description, and the derivation it runs on every description write.
registerDescriptionColumns('attachment', ['keywords']);
registerDescriptionDerivation('attachment', (description) => ({ keywords: deriveDocument(description).keywords }));

const handleError = createResourceError('attachment');

/** Marks the organization's lists for a refetch; the active ones refetch now unless another attachment mutation is pending. */
const invalidateOrgLists = (queryClient: QueryClient, organizationId: string) =>
  invalidateIfLastMutation(queryClient, keys.all, keys.list.org(organizationId));

/** Writes an edit into the cached row of the org lists and the detail. */
const patchCachedAttachment = (queryClient: QueryClient, organizationId: string, row: Attachment, ops: UpdateAttachmentVars['ops']) => {
  const patched = { ...row, ...ops, updatedAt: new Date().toISOString() };
  cacheUpdate(keys.list.org(organizationId), [patched]);
  writeKeepingMark(queryClient, keys.detail.byId(row.id), () => patched);
};

type AttachmentsListParams = AttachmentFilters & { tenantId: string; organizationId: string; limit?: number };

export const attachmentsListQueryOptions = (params: AttachmentsListParams) => {
  const {
    tenantId,
    organizationId,
    q = attachmentsSearchDefaults.q,
    sort = attachmentsSearchDefaults.sort,
    order = attachmentsSearchDefaults.order,
    limit = appConfig.pageSizes.attachments,
  } = params;

  const filters = { q, sort, order };
  const query = { q, orderBy: orderByParam(sort, order) };

  const paging = tokenPaging((pageToken, signal) =>
    listAttachments({ path: { tenantId, organizationId }, query: { ...query, ...pageQuery(limit, pageToken) }, signal }).then(liveItems),
  );
  return syncedListOptions(
    infiniteQueryOptions({
      queryKey: keys.list.filtered(organizationId, filters),
      ...paging,
      meta: { ...paging.meta, persist: false },
      staleTime: syncStaleTime,
    }),
  );
};

/**
 * Where attachments live below the organization, a row enters its channel's home list, so the org-wide list spans homes:
 * it takes a filtered key, which live sync invalidates and refetches (`create-query-keys.ts`).
 */
const orgListSpansHomes = hierarchy.possibleHomeChannels('attachment').some((type) => type !== 'organization');

export const attachmentsCanonicalOptions = ({ organizationId, tenantId }: { organizationId: string; tenantId: string }) =>
  syncedListOptions(
    queryOptions({
      queryKey: orgListSpansHomes ? keys.list.filtered(organizationId, { channelId: organizationId }) : keys.list.home(organizationId),
      queryFn: async () =>
        fetchAllPages((page) => listAttachments({ path: { tenantId, organizationId }, query: page }).then(liveItems), syncChunkSize),
      staleTime: syncStaleTime,
    }),
    { organizationId, tenantId },
  );

export const attachmentQueryOptions = (tenantId: string, organizationId: string, id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: () => getAttachment({ path: { tenantId, organizationId, attachmentId: id } }),
    initialData: () => findAttachmentInCache(id),
  });

export const findAttachmentInCache = createCacheFinder<Attachment>('attachment');

/** An attachment by id from the cache, else from the permission-checked endpoint; null when it is gone or denied. */
export const fetchAttachment = (tenantId: string, organizationId: string, id: string) =>
  queryClient.query({ ...attachmentQueryOptions(tenantId, organizationId, id), staleTime: 'static' }).catch(() => null);

export const useGroupAttachments = (tenantId: string | undefined, organizationId: string | undefined, groupId: string | undefined) => {
  const { data } = useQuery({
    ...attachmentsCanonicalOptions({ organizationId: organizationId!, tenantId: tenantId! }),
    enabled: !!tenantId && !!organizationId && !!groupId,
    select: ({ results }) => {
      if (!groupId) return null;
      const filtered = results.filter((item) => item.groupId === groupId);
      return filtered.length > 0 ? filtered : null;
    },
  });

  return data ?? null;
};

type CreateData = Awaited<ReturnType<typeof createAttachmentsMutationFn>>;
type UpdateData = Awaited<ReturnType<typeof updateAttachmentMutationFn>>;
type DeleteData = Awaited<ReturnType<typeof deleteAttachmentsMutationFn>>;

/** Shared by the live hook and the offline-replay defaults: callbacks take the QueryClient and derive the org key from durable variables, since onMutate does not re-run on replay. */
export const attachmentCreateOptions = (
  queryClient: QueryClient,
): UseMutationOptions<CreateData, Error, CreateAttachmentVars, { optimisticAttachments: OrgRoutableItemData[] }> => ({
  mutationKey: keys.create,
  scope: { id: 'attachment' },
  mutationFn: createAttachmentsMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ tenantId, organizationId, data }) => {
    const orgKey = keys.list.org(organizationId);
    await cancelKeepingMark(queryClient, orgKey);
    const optimisticAttachments = data.map((attachment) => createOptimisticEntity(zAttachment, { ...attachment, tenantId, organizationId }));
    insertEntitiesIntoHome(queryClient, optimisticAttachments);
    return { optimisticAttachments };
  },
  onError: (error, variables, context) => {
    handleError('create', error);
    if (context?.optimisticAttachments) cacheRemove(keys.list.org(variables.organizationId), context.optimisticAttachments);
  },
  onSuccess: (result, variables, context) => {
    const orgKey = keys.list.org(variables.organizationId);
    if (context?.optimisticAttachments) cacheRemove(orgKey, context.optimisticAttachments);
    insertEntitiesIntoHome(queryClient, result.results);
    // The own-create echo only patches rows already cached, so a list that spans homes refetches here.
    if (orgListSpansHomes) queryClient.invalidateQueries({ queryKey: attachmentsCanonicalOptions(variables).queryKey });
  },
  onSettled: (_data, error, variables) => {
    if (error) invalidateOrgLists(queryClient, variables.organizationId);
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
    await cancelKeepingMark(queryClient, keys.list.org(organizationId));
    await cancelKeepingMark(queryClient, keys.detail.byId(id));

    const previousAttachment = findAttachmentInCache(id);
    if (previousAttachment) patchCachedAttachment(queryClient, organizationId, previousAttachment, ops);
    return { previousAttachment };
  },
  onError: (error, variables, context) => {
    // Deleted while the update was under way: nothing to report, and a rollback would put the row back in the cache.
    if (context?.previousAttachment && !findAttachmentInCache(context.previousAttachment.id)) return;
    handleError('update', error);
    if (context?.previousAttachment) {
      cacheUpdate(keys.list.org(variables.organizationId), [context.previousAttachment]);
      writeKeepingMark(queryClient, keys.detail.byId(context.previousAttachment.id), () => context.previousAttachment);
    }
  },
  onSuccess: (updatedAttachment, variables) => {
    const orgKey = keys.list.org(variables.organizationId);
    const detailKey = keys.detail.byId(updatedAttachment.id);
    const cached = findAttachmentInCache(updatedAttachment.id);
    const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
    const merged = mergeServerResponse({ queryClient, cached, serverEntity: updatedAttachment, mutatedKeys });
    writeEntityToCache({ entity: merged, listKey: orgKey, detailKey, queryClient });
  },
  onSettled: (_data, error, variables) => {
    if (error) invalidateOrgLists(queryClient, variables.organizationId);
  },
});

const attachmentDeleteOptions = (
  queryClient: QueryClient,
): UseMutationOptions<DeleteData, Error, DeleteAttachmentVars, { deletedAttachments: Attachment[] }> => ({
  mutationKey: keys.delete,
  scope: { id: 'attachment' },
  mutationFn: deleteAttachmentsMutationFn,
  meta: { suppressGlobalErrorToast: true },
  onMutate: async ({ organizationId, rows }) => {
    const orgKey = keys.list.org(organizationId);
    const attachmentIds = rows.map((row) => row.id);
    removePendingMutations(queryClient, keys.update, attachmentIds);
    await cancelKeepingMark(queryClient, orgKey);
    cacheRemove(orgKey, rows);
    removeDetailQueriesById(queryClient, keys.detail.base, attachmentIds);
    return { deletedAttachments: rows };
  },
  onError: (error, _variables, context) => {
    handleError('delete', error);
    if (context?.deletedAttachments) insertEntitiesIntoHome(queryClient, context.deletedAttachments);
  },
  onSuccess: (result, variables) => {
    const rejectedIds = result?.rejectedIds ?? [];
    const rejectedSet = new Set(rejectedIds);
    // A replayed create or a list read may have put a row back while the delete waited, and its own echo fetches nothing.
    const deleted = variables.rows.filter((row) => !rejectedSet.has(row.id));
    cacheRemove(keys.list.org(variables.organizationId), deleted);
    removeDetailQueriesById(
      queryClient,
      keys.detail.base,
      deleted.map(({ id }) => id),
    );
    if (rejectedIds.length === 0) return;
    const rejectedAttachments = variables.rows.filter((row) => rejectedSet.has(row.id));
    insertEntitiesIntoHome(queryClient, rejectedAttachments);
    toaster.info(i18n.t('c:resources_delete_denied', { count: rejectedIds.length, total: variables.rows.length }));
  },
  onSettled: (data, error, variables) => {
    // A row put back is as the delete held it: remote changes were kept from the cache while it was pending.
    if (error || data?.rejectedIds?.length) invalidateOrgLists(queryClient, variables.organizationId);
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
    if (squashIntoPendingCreate(queryClient, keys.create, id, ops, attachmentCreateKeys)) {
      const cached = findAttachmentInCache(id);
      if (cached) patchCachedAttachment(queryClient, organizationId, cached, ops);
      return { kind: 'coalesced' };
    }

    const newStx = createStxForUpdate(Object.keys(ops));
    const { ops: mergedOps, stx } = squashPendingMutation(queryClient, keys.update, id, ops, newStx);
    return { kind: 'run', vars: { tenantId, organizationId, id, ops: mergedOps, stx } };
  };

  return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
};

/** A row whose create never left the device leaves the cache without a request (`prepareProductDelete`). */
export const useAttachmentDeleteMutation = (tenantId: string, organizationId: string) => {
  const queryClient = useQueryClient();
  const mutation = useMutation(attachmentDeleteOptions(queryClient));

  const prepare = (attachments: Attachment[]): PreparedVars<DeleteAttachmentVars> =>
    prepareProductDelete(queryClient, keys, keys.list.org(organizationId), attachments, (rows) => ({
      tenantId,
      organizationId,
      rows,
      stx: createStxForDelete(),
    }));

  return { ...mutation, ...buildPreparedHandlers(mutation, prepare) };
};

// Mutation defaults (offline persistence): set when the module loads, before the cache restore hydrates a queued mutation.
queryClient.setQueryDefaults(keys.detail.base, {
  queryFn: ({ queryKey }) => {
    const id = queryKey[2] as string;
    const cached = findAttachmentInCache(id);
    const { organizationId, tenantId } = resolveQueryOrgTenantIds(cached, 'attachment');
    return getAttachment({ path: { attachmentId: id, organizationId, tenantId } });
  },
});

queryClient.setMutationDefaults(keys.create, attachmentCreateOptions(queryClient));
queryClient.setMutationDefaults(keys.update, attachmentUpdateOptions(queryClient));
queryClient.setMutationDefaults(keys.delete, attachmentDeleteOptions(queryClient));

// Version 2 of a create sends each row's `size` as a byte count; a bundle of version 1 queued it as a string.
registerVariablesVersion(keys.create, 2, (variables) => {
  if (typeof variables !== 'object' || variables === null || !('data' in variables) || !Array.isArray(variables.data)) return null;
  const data = variables.data.map((row: unknown) =>
    typeof row === 'object' && row !== null && 'size' in row && typeof row.size === 'string' ? { ...row, size: Number(row.size) } : row,
  );
  return { ...variables, data };
});

// A placeholder turns into its file once a row with stored keys reaches the cache: from sync, a create or a key link.
queryClient.getQueryCache().subscribe((event) => {
  if (event.type !== 'updated' || event.query.queryKey[0] !== 'attachment' || !hasPendingUploads()) return;
  clearStoredUploads((id) => {
    const row = findAttachmentInCache(id);
    return !!row && !isPendingUpload(row);
  });
});
