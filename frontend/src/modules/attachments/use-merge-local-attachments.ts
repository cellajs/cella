import { appConfig } from 'config';
import { useEffect, useRef } from 'react';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import type { AttachmentSearch } from '~/modules/attachments/table/table-wrapper';
import type { Attachment, AttachmentInfiniteQueryData, AttachmentQueryData } from '~/modules/attachments/types';
import { formatUpdatedData, getQueryItems } from '~/query/helpers/mutate-query';
import { queryClient } from '~/query/query-client';
import { nanoid } from '~/utils/nanoid';

const limit = appConfig.requestLimits.attachments;
export const useMergeLocalAttachments = (organizationId: string, { q, sort, order }: AttachmentSearch) => {
  const { getData: fetchStoredFiles } = LocalFileStorage;

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

      const queryOptions = attachmentsQueryOptions({ orgIdOrSlug: organizationId, q, sort, order, limit });

      await queryClient.prefetchInfiniteQuery(queryOptions);

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryOptions.queryKey, (existingData) => {
        if (!existingData) return existingData;

        const existingItems = getQueryItems(existingData);
        const existingIds = new Set(existingItems.map((item) => item.id));

        const filtered = localAttachments.filter((item) => !existingIds.has(item.id));
        if (!filtered.length) return existingData;

        const updatedItems = order === 'asc' ? [...existingItems, ...filtered] : [...filtered, ...existingItems];
        return formatUpdatedData(existingData, updatedItems, limit, filtered.length);
      });
      enrichedRef.current = true;
    };
    mergeLocalAttachmentsIntoCache();
  }, [organizationId]);
};
