import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { type Collection, createCollection } from '@tanstack/react-db';
import { queryOptions } from '@tanstack/react-query';
import { appConfig } from 'config';
import { t } from 'i18next';
import { createAttachment, deleteAttachments, getAttachmentsGroup, type GetAttachmentsGroupData, updateAttachment } from '~/api.gen';
import { clientConfig } from '~/lib/api';
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
export const getAttachmentsCollection = (organizationId: string): Collection<LiveQueryAttachment> => {
  const params = {
    table: 'attachments',
    where: `organization_id = '${organizationId}'`,
  };

  return createCollection(
    electricCollectionOptions({
      id: `sync-attachments-${organizationId}`,
      shapeOptions: {
        url: new URL(`/${organizationId}/attachments/shape-proxy`, appConfig.backendUrl).href,
        params,
        backoffOptions,
        fetchClient: clientConfig.fetch,
        onError: (error) => handleSyncError(error, params),
      },
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        const { attachments } = transaction.mutations[0].metadata as {
          attachments: (AttachmentToInsert & { id: string })[];
        };
        try {
          await createAttachment({ body: attachments, path: { orgIdOrSlug: organizationId } });
        } catch {
          toaster(t('error:create_resource', { resource: t('common:attachment') }), 'error');
        }
        return { txid: Date.now() };
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

              results.push(Date.now()); // Use timestamp as txid
            } catch {
              toaster(t('error:update_resource', { resource: t('common:attachment') }), 'error');
            }
          }),
        );
        return { txid: results };
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
        return { txid: Date.now() };
      },
    }),
  );
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

        return files.map(({ size, preview, id, type, data, meta }) => {
          return {
            id,
            filename: meta?.name || 'Unnamed file',
            name: meta.name,
            content_type: type,
            size: size ? String(size) : String(data.size),
            original_key: preview ?? '',
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
