import type { QueryClient, UseMutationOptions } from '@tanstack/react-query';
import { infiniteQueryOptions, queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import { type Attachment, type GetAttachmentsData, getAttachment, getAttachments } from 'sdk';
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
import { registerYjsOwnedFields } from '~/modules/common/blocknote/yjs-editor';
import { toaster } from '~/modules/common/toaster/toaster';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { cacheRemove, cacheUpdate, removeDetailQueriesById } from '~/query/basic/cache-mutations';
import { createOptimisticEntity } from '~/query/basic/create-optimistic';
import { createEntityKeys } from '~/query/basic/create-query-keys';
import { registerEntityQueryKeys } from '~/query/basic/entity-query-registry';
import { fetchAllPages } from '~/query/basic/fetch-all-pages';
import { createCacheFinder } from '~/query/basic/find-in-list-cache';
import { offsetPaging, pageQuery } from '~/query/basic/infinite-query-options';
import { invalidateIfLastMutation, removePendingMutations } from '~/query/basic/invalidation-helpers';
import { syncStaleTime } from '~/query/basic/sync-stale-state';
import type { OrgRoutableItemData } from '~/query/basic/types';
import { addMutationRegistrar } from '~/query/mutation-registry';
import { registerVariablesVersion } from '~/query/offline/mutation-variables';
import { prepareProductDelete } from '~/query/offline/prepare-delete';
import { buildPreparedHandlers, type PreparedVars } from '~/query/offline/prepared-mutation';
import { squashIntoPendingCreate, squashPendingMutation } from '~/query/offline/squash-utils';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import { mergeServerResponse, syncEntityToCache } from '~/query/offline/update-success-utils';
import { queryClient } from '~/query/query-client';
import { resolveQueryOrgTenantIds } from '~/query/realtime/sync-priority';
import { createResourceError } from '~/utils/resource-error';

type AttachmentFilters = Omit<NonNullable<GetAttachmentsData['query']>, 'limit' | 'offset' | 'afterSeq' | 'untilSeq'>;

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
  return getAttachments({ path: { tenantId: tenantId!, organizationId: organizationId! }, query: { ...query, channelId } });
});
export const attachmentQueryKeys = keys;

/** The columns `update-attachment.ts` stores from a description. */
const descriptionDerivedKeys = ['keywords'];

// A derived column follows the description's stamp.
registerYjsOwnedFields('attachment', ['description', ...descriptionDerivedKeys]);
// The derivation `update-attachment.ts` runs on every description write.
registerDescriptionDerivation('attachment', (description) => ({ keywords: deriveDocument(description).keywords }));

const handleError = createResourceError('attachment');

/** Refetches the organization's lists once no other attachment mutation is pending. */
const invalidateOrgLists = (queryClient: QueryClient, organizationId: string) =>
  invalidateIfLastMutation(queryClient, keys.all, keys.list.org(organizationId));

/** Writes an edit into the cached row of the org lists and the detail. */
const patchCachedAttachment = (queryClient: QueryClient, organizationId: string, row: Attachment, ops: UpdateAttachmentVars['ops']) => {
  const patched = { ...row, ...ops, updatedAt: new Date().toISOString() };
  cacheUpdate(keys.list.org(organizationId), [patched]);
  queryClient.setQueryData(keys.detail.byId(row.id), patched);
};

type AttachmentsListParams = AttachmentFilters & {
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
    limit = appConfig.requestLimits.attachments,
  } = params;

  const filters = { q, sort, order };

  return infiniteQueryOptions({
    queryKey: keys.list.filtered(organizationId, filters),
    ...offsetPaging(limit, (offset, signal) =>
      getAttachments({ path: { tenantId, organizationId }, query: { ...filters, ...pageQuery(limit, offset) }, signal }),
    ),
    meta: { persist: false },
    staleTime: syncStaleTime,
  });
};

/**
 * Where attachments live below the organization, a row enters its channel's home list, so the org-wide list spans homes:
 * it takes a filtered key, which live sync invalidates and refetches (`create-query-keys.ts`).
 */
const orgListSpansHomes = hierarchy.possibleHomeChannels('attachment').some((type) => type !== 'organization');

export const attachmentsCanonicalOptions = ({ organizationId, tenantId }: { organizationId: string; tenantId: string }) => {
  return queryOptions({
    queryKey: orgListSpansHomes ? keys.list.filtered(organizationId, { channelId: organizationId }) : keys.list.home(organizationId),
    queryFn: async () => {
      return fetchAllPages(({ limit, offset }) => getAttachments({ path: { tenantId, organizationId }, query: { limit, offset } }), 1000);
    },
    staleTime: syncStaleTime,
  });
};

export const attachmentQueryOptions = (tenantId: string, organizationId: string, id: string) =>
  queryOptions({
    queryKey: keys.detail.byId(id),
    queryFn: () => getAttachment({ path: { tenantId, organizationId, id } }),
    initialData: () => findAttachmentInCache(id),
  });

export const findAttachmentInCache = createCacheFinder<Attachment>('attachment');

/** An attachment by id from the cache, else from the permission-checked endpoint; null when it is gone or denied. */
export const fetchAttachment = (tenantId: string, organizationId: string, id: string) =>
  queryClient.query({ ...attachmentQueryOptions(tenantId, organizationId, id), staleTime: 'static' }).catch(() => null);

export function useGroupAttachments(tenantId: string | undefined, organizationId: string | undefined, groupId: string | undefined) {
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

/** Shared by the live hook and the offline-replay defaults: callbacks take the QueryClient and derive the org key from durable variables, since onMutate does not re-run on replay. */
export const attachmentCreateOptions = (
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
  onError: (error, variables, context) => {
    handleError('create', error);
    if (context?.optimisticAttachments) cacheRemove(keys.list.org(variables.organizationId), context.optimisticAttachments);
  },
  onSuccess: (result, variables, context) => {
    const orgKey = keys.list.org(variables.organizationId);
    if (context?.optimisticAttachments) cacheRemove(orgKey, context.optimisticAttachments);
    insertEntitiesIntoHome(queryClient, result.data);
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
    await queryClient.cancelQueries({ queryKey: keys.list.org(organizationId) });
    await queryClient.cancelQueries({ queryKey: keys.detail.byId(id) });

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
      queryClient.setQueryData(keys.detail.byId(context.previousAttachment.id), context.previousAttachment);
    }
  },
  onSuccess: (updatedAttachment, variables) => {
    const orgKey = keys.list.org(variables.organizationId);
    const detailKey = keys.detail.byId(updatedAttachment.id);
    const cached = findAttachmentInCache(updatedAttachment.id);
    const mutatedKeys = variables.ops ? Object.keys(variables.ops) : [];
    const merged = mergeServerResponse({
      cached,
      serverEntity: updatedAttachment,
      mutatedKeys,
      derivedKeys: { description: descriptionDerivedKeys },
    });
    syncEntityToCache({ entity: merged, listKey: orgKey, detailKey, queryClient });
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
    await queryClient.cancelQueries({ queryKey: orgKey });
    cacheRemove(orgKey, rows);
    removeDetailQueriesById(queryClient, keys.detail.base, attachmentIds);
    return { deletedAttachments: rows };
  },
  onError: (error, _variables, context) => {
    handleError('delete', error);
    if (context?.deletedAttachments) {
      insertEntitiesIntoHome(queryClient, context.deletedAttachments);
    }
  },
  onSuccess: (result, variables) => {
    const rejectedIds = result?.rejectedIds ?? [];
    if (rejectedIds.length === 0) return;
    const rejectedSet = new Set(rejectedIds);
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

/** Prepared delete mutation: usable offline and squashes multiple deletes into one. */
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

  // A placeholder turns into its file once a row with stored keys reaches the cache: from sync, a create or a key link.
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.query.queryKey[0] !== 'attachment' || !hasPendingUploads()) return;
    clearStoredUploads((id) => {
      const row = findAttachmentInCache(id);
      return !!row && !isPendingUpload(row);
    });
  });
});

// Version 2 of a delete carries its rows under `rows`; a bundle of version 1 queued them as `attachments`.
registerVariablesVersion(keys.delete, 2, (variables) => {
  if (typeof variables !== 'object' || variables === null || !('attachments' in variables)) return null;
  const { attachments, ...rest } = variables;
  return Array.isArray(attachments) ? { ...rest, rows: attachments } : null;
});
