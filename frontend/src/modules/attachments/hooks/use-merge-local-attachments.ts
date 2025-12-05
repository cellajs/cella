import { appConfig } from 'config';
import { useEffect, useRef } from 'react';
import type { Attachment } from '~/api.gen';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { attachmentsQueryOptions } from '~/modules/attachments/query';
import type { AttachmentInfiniteQueryData, AttachmentQueryData, AttachmentsRouteSearchParams } from '~/modules/attachments/types';
import { queryClient } from '~/query/query-client';
import { formatUpdatedCacheData, getQueryItems } from '~/query/utils/mutate-query';
import { nanoid } from '~/utils/nanoid';

const limit = appConfig.requestLimits.attachments;

export const useMergeLocalAttachments = (organizationId: string, { q, sort, order }: AttachmentsRouteSearchParams) => {
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

      // TODO(DAVID)(IMPROVE)local file info(add createdAt/By, groupId into the file?)
      // TODO: can we derive this from shared schema?
      const localAttachments: Attachment[] = files.map(({ size, preview, id, type, data, name, meta }) => ({
        id,
        size: String(size || data?.size || 0),
        description: '',
        url: preview || '',
        thumbnailUrl: null,
        convertedUrl: null,
        contentType: type,
        convertedContentType: null,
        name: name || meta.name, // to handle offline name update, not updating orig fileName from meta
        public: meta.public,
        bucketName: meta.bucketName,
        entityType: 'attachment',
        createdAt: new Date().toISOString(),
        createdBy: null,
        modifiedAt: null,
        modifiedBy: null,
        groupId,
        filename: meta.name || 'Unnamed file',
        organizationId,
      }));

      const queryOptions = attachmentsQueryOptions({
        orgIdOrSlug: organizationId,
        q,
        sort,
        order,
        limit,
      });

      await queryClient.prefetchInfiniteQuery(queryOptions);

      queryClient.setQueryData<AttachmentInfiniteQueryData | AttachmentQueryData>(queryOptions.queryKey, (existingData) => {
        if (!existingData) return existingData;

        const existingItems = getQueryItems(existingData);
        const existingIds = new Set(existingItems.map((item) => item.id));

        const filtered = localAttachments.filter((item) => !existingIds.has(item.id));
        if (!filtered.length) return existingData;

        const updatedItems = order === 'asc' ? [...existingItems, ...filtered] : [...filtered, ...existingItems];
        return formatUpdatedCacheData(existingData, updatedItems, limit, filtered.length);
      });
      enrichedRef.current = true;
    };
    mergeLocalAttachmentsIntoCache();
  }, [organizationId]);
};
