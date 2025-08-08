import { type ElectricCollectionConfig, electricCollectionOptions } from '@tanstack/electric-db-collection';
import { type QueryCollectionConfig, queryCollectionOptions } from '@tanstack/query-db-collection';
import { type Collection, type CollectionConfig, createCollection } from '@tanstack/react-db';
import { type QueryKey, queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createAttachment, deleteAttachments, getAttachmentsGroup, type GetAttachmentsGroupData, updateAttachment } from '~/api.gen';
import { env } from '~/env';
import { type ApiError, clientConfig } from '~/lib/api';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import type { AttachmentToInsert, LiveQueryAttachment } from '~/modules/attachments/types';
import type { CustomUppyFile } from '~/modules/common/uploader/types';
import { queryClient } from '~/query/query-client';
import { baseBackoffOptions as backoffOptions, handleSyncError } from '~/utils/electric-utils';
import { nanoid } from '~/utils/nanoid';
import { toaster } from '../common/toaster';
/**
 * Keys for attachments related queries. These keys help to uniquely identify different query.
 * For managing query caching and invalidation.
 */
export const attachmentsKeys = {
  all: ['attachments'] as const,
  local: () => [...attachmentsKeys.all, 'local'] as const,
  list: () => [...attachmentsKeys.all, 'list'] as const,
};

/**
 * Query Options for fetching a grouped attachments.
 *
 * This function returns the configuration for querying group of attachments from target organization.
 *
 * @param param.orgIdOrSlug - Organization ID or slug.
 * @param param.attachmentId - attachmentId, to fetch all attachments of same group.
 * @returns  Query options.
 */
export const groupedAttachmentsQueryOptions = ({
  orgIdOrSlug,
  mainAttachmentId,
}: GetAttachmentsGroupData['path'] & GetAttachmentsGroupData['query']) =>
  queryOptions({
    queryKey: attachmentsKeys.list(),
    queryFn: () => getAttachmentsGroup({ query: { mainAttachmentId }, path: { orgIdOrSlug } }),
    staleTime: 0,
    gcTime: 0,
  });

//TODO (TanStackDB) make optimistic updates work offline
export const getAttachmentsCollection = (
  organizationId: string,
  offlinePrefetch = false,
): { collection: Collection<LiveQueryAttachment>; controller: AbortController | null } => {
  // Create a new AbortController to allow aborting fetch requests if needed
  const controller = new AbortController();

  // Determine if we are in "regular" mode (no sync, no upload, or quick mode)
  const isRegularOptions = !appConfig.has.sync || !appConfig.has.uploadEnabled || env.VITE_QUICK;

  // Query params for fetching attachments for a specific organization
  const params = {
    table: 'attachments',
    where: `organization_id = '${organizationId}'`,
  };

  // Configuration for electric collection when using sync
  const shapeOptions = {
    url: new URL(`/${organizationId}/attachments/shape-proxy?offlinePrefetch=${offlinePrefetch}`, appConfig.backendUrl).href,
    params,
    backoffOptions,
    fetchClient: clientConfig.fetch,
    onError: (error: Error) => handleSyncError(error, params),
    signal: controller.signal, // Pass AbortSignal for cancellation support
  };

  // Base options common to both regular and electric collections
  const baseOptions: Pick<
    QueryCollectionConfig<LiveQueryAttachment, ApiError, QueryKey> | ElectricCollectionConfig<LiveQueryAttachment>,
    'id' | 'getKey' | 'onInsert' | 'onUpdate' | 'onDelete'
  > = {
    id: `attachments-${organizationId}`,
    getKey: (item: { id: string }) => item.id,
    onInsert: async ({ transaction }) => {
      const { attachments } = transaction.mutations[0].metadata as {
        attachments: (AttachmentToInsert & { id: string })[];
      };
      try {
        await createAttachment({ body: attachments, path: { orgIdOrSlug: organizationId } });
      } catch {
        toaster(t('error:create_resource', { resource: t('common:attachment') }), 'error');
      }
      // Return transaction ID only for sync mode; empty object otherwise
      return isRegularOptions ? {} : { txid: Date.now() };
    },
    onUpdate: async ({ transaction }) => {
      const results: number[] = [];

      await Promise.all(
        transaction.mutations.map(async ({ type, changes, original }) => {
          try {
            if (!changes.name || type !== 'update') return;
            const originalAttachment = original as LiveQueryAttachment;

            await updateAttachment({
              body: { name: changes.name },
              path: { id: originalAttachment.id, orgIdOrSlug: originalAttachment.organization_id },
            });

            results.push(Date.now()); // Track timestamp txid per mutation
          } catch {
            toaster(t('error:update_resource', { resource: t('common:attachment') }), 'error');
          }
        }),
      );
      // Return transaction IDs only in sync mode
      return isRegularOptions ? {} : { txid: results };
    },
    onDelete: async ({ transaction }) => {
      const ids: string[] = [];
      for (const { changes } of transaction.mutations) {
        if (changes && 'id' in changes && typeof changes.id === 'string') ids.push(changes.id);
      }
      try {
        await deleteAttachments({ body: { ids }, path: { orgIdOrSlug: organizationId } });
      } catch (err) {
        if (ids.length > 1) toaster(t('error:delete_resources', { resources: t('common:attachments') }), 'error');
        else toaster(t('error:delete_resource', { resource: t('common:attachment') }), 'error');
      }
      // Return transaction ID only in sync mode
      return isRegularOptions ? {} : { txid: Date.now() };
    },
  };

  // Select collection config based on mode:
  // - Regular: use queryCollectionOptions with a local query function returning empty array
  // - Sync-enabled: use electricCollectionOptions with shapeOptions for live syncing
  const queryOptions: CollectionConfig<LiveQueryAttachment> = isRegularOptions
    ? queryCollectionOptions({
        ...baseOptions,
        queryKey: attachmentsKeys.local(),
        queryClient,
        //TODO (TanStackDB) add BE fetch
        queryFn: async () => {
          return [];
        },
      })
    : electricCollectionOptions({
        ...baseOptions,
        shapeOptions,
      });

  // Create the collection instance using the selected config
  return {
    collection: createCollection(queryOptions),
    controller: isRegularOptions ? null : controller,
  };
};

//TODO (TanStackDB) make optimistic updates work offline
export const getLocalAttachmentsCollection = (organizationId: string): Collection<LiveQueryAttachment> => {
  return createCollection(
    queryCollectionOptions({
      id: `sync-local-attachments-${organizationId}`,
      getKey: (item) => item.id,
      queryKey: attachmentsKeys.local(),
      queryClient,
      queryFn: async () => {
        const storageData = await LocalFileStorage.getData(organizationId);
        if (!storageData) return [] as LiveQueryAttachment[];

        const files = Object.values(storageData.files ?? {});
        if (!files.length) return [] as LiveQueryAttachment[];

        const groupId = files.length > 1 ? nanoid() : null;

        return files.map((file) => {
          const name = file.name || file.meta.name;
          const filename = `${name}.${file.extension}`;

          const size = file.size ? String(file.size) : String(file.data.size);

          return {
            id: file.id,
            filename,
            name,
            content_type: file.type,
            size,
            original_key: file.preview ?? '',
            thumbnail_key: null,
            converted_key: null,
            converted_content_type: null,
            entity_type: 'attachment' as const,
            created_at: new Date().toISOString(),
            created_by: null,
            modified_at: null,
            modified_by: null,
            group_id: groupId,
            organization_id: organizationId,
          };
        });
      },
      onInsert: async () => {
        try {
          console.info('Successfully added attachments locally.');
          return { refetch: true };
        } catch (error) {
          console.error('Failed to add attachments locally:', error);
        }
      },

      onUpdate: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(async ({ changes, original }) => {
            try {
              const originalAttachment = original as LiveQueryAttachment;

              await LocalFileStorage.changeFile(originalAttachment.id, changes as Partial<CustomUppyFile>);
              console.info('Successfully updated locally stored attachments.');

              return { refetch: true };
            } catch (err) {
              console.error('Failed to update locally stored attachment:', err);
            }
          }),
        );
      },

      onDelete: async ({ transaction }) => {
        const storedIds: string[] = [];
        for (const { changes } of transaction.mutations) {
          if (changes && 'id' in changes && typeof changes.id === 'string') storedIds.push(changes.id);
        }
        try {
          await LocalFileStorage.removeFiles(storedIds);
          console.info('Successfully deleted locally stored attachments.');

          return { refetch: true };
        } catch (err) {
          console.error('Failed to deleted locally stored attachments:', err);
        }
      },
    }),
  );
};
