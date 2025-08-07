import type { Collection } from '@tanstack/react-db';
import { useEffect, useRef } from 'react';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import type { Attachment, LiveQueryAttachment } from '~/modules/attachments/types';
import { useTransaction } from '~/modules/attachments/use-transaction';
import { nanoid } from '~/utils/nanoid';

export const useMergeLocalAttachments = (organizationId: string, attachmentCollection: Collection<LiveQueryAttachment>) => {
  const { getData: fetchStoredFiles } = LocalFileStorage;

  const createAttachmens = useTransaction<LiveQueryAttachment>({
    mutationFn: async () => console.log('Merge local attachments into table'),
  });

  const enrichedRef = useRef(false); // Prevent multiple injections

  useEffect(() => {
    if (enrichedRef.current) return;

    const mergeLocalAttachmentsIntoCache = async () => {
      const storageData = await fetchStoredFiles(organizationId);
      if (!storageData) return;

      const files = Object.values(storageData.files ?? {});
      if (!files.length) return;

      const groupId = files.length > 1 ? nanoid() : null;

      const localAttachments: Attachment[] = files.map(({ size, preview, id, type, data, meta }) => ({
        id,
        size: size ? String(size) : String(data.size),
        url: preview || '',
        thumbnailUrl: null,
        convertedUrl: null,
        contentType: type,
        convertedContentType: null,
        name: meta.name,
        entityType: 'attachment',
        createdAt: new Date().toISOString(),
        createdBy: null,
        modifiedAt: null,
        modifiedBy: null,
        groupId,
        filename: meta?.name || 'Unnamed file',
        organizationId,
      }));

      const tableAttachmetns = localAttachments.map((a) => {
        const optimisticId = a.id || nanoid();
        const groupId = localAttachments.length > 1 ? nanoid() : null;

        return {
          id: optimisticId,
          filename: a.filename,
          name: a.filename.split('.').slice(0, -1).join('.'),
          content_type: a.contentType,
          size: a.size,
          original_key: a.url,
          thumbnail_key: a.thumbnailUrl ?? null,
          converted_key: a.convertedUrl ?? null,
          converted_content_type: a.convertedContentType ?? null,
          entity_type: 'attachment' as const,
          created_at: new Date().toISOString(),
          created_by: null,
          modified_at: null,
          modified_by: null,
          group_id: groupId,
          organization_id: organizationId,
        };
      });

      // TODO(tanstack DB) error You can no longer call .mutate() as the transaction is no longer pending
      createAttachmens.mutate(() => attachmentCollection.insert(tableAttachmetns));

      enrichedRef.current = true;
    };
    mergeLocalAttachmentsIntoCache();
  }, [organizationId]);
};
