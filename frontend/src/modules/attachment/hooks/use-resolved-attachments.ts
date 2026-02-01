import { useEffect, useRef, useState } from 'react';
import { getPresignedUrl } from '~/api.gen/sdk.gen';
import type { CarouselItemData } from '~/modules/attachment/carousel';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';
import { findAttachmentInListCache } from '~/modules/attachment/query';

export interface ResolvedAttachmentsResult {
  /** Resolved items with URLs populated */
  items: CarouselItemData[];
  /** Whether any items are still being resolved */
  isLoading: boolean;
  /** Whether any items failed to resolve (not found in cache) */
  hasErrors: boolean;
  /** IDs of items that couldn't be resolved */
  errorIds: string[];
}

/**
 * Resolves attachment URLs for carousel items.
 * For items with empty/missing URLs, looks up attachment in cache and resolves URL.
 * Handles both local blob URLs and cloud presigned URLs.
 */
export function useResolvedAttachments(
  items: Array<Partial<CarouselItemData> & { id: string }>,
): ResolvedAttachmentsResult {
  const [resolvedItems, setResolvedItems] = useState<CarouselItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorIds, setErrorIds] = useState<string[]>([]);

  // Use ref for blob URLs to ensure proper cleanup across effect cycles
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!items.length) {
      setResolvedItems([]);
      setIsLoading(false);
      setErrorIds([]);
      return;
    }

    // Revoke previous blob URLs before creating new ones
    for (const blobUrl of blobUrlsRef.current.values()) {
      URL.revokeObjectURL(blobUrl);
    }
    blobUrlsRef.current.clear();

    let cancelled = false;

    const resolveAll = async () => {
      setIsLoading(true);
      const errors: string[] = [];
      const resolved: CarouselItemData[] = [];

      for (const item of items) {
        if (cancelled) break;

        // If item already has a URL, use it directly
        if (item.url) {
          resolved.push(item as CarouselItemData);
          continue;
        }

        // Look up attachment in cache to get metadata
        const cachedAttachment = findAttachmentInListCache(item.id);

        if (!cachedAttachment) {
          // Not in cache - can't resolve
          errors.push(item.id);
          continue;
        }

        try {
          let resolvedUrl: string | null = null;

          // Try local blob first
          const localUrl = await attachmentStorage.createBlobUrl(item.id);
          if (localUrl) {
            resolvedUrl = localUrl;
            blobUrlsRef.current.set(item.id, localUrl);
          }

          // Fall back to cloud URL
          if (!resolvedUrl && cachedAttachment.originalKey) {
            resolvedUrl = await getPresignedUrl({
              query: {
                key: cachedAttachment.originalKey,
                isPublic: cachedAttachment.public,
              },
            });
          }

          if (!cancelled && resolvedUrl) {
            resolved.push({
              id: item.id,
              url: resolvedUrl,
              name: item.name ?? cachedAttachment.name,
              filename: item.filename ?? cachedAttachment.filename,
              contentType: item.contentType ?? cachedAttachment.contentType,
              convertedUrl: cachedAttachment.convertedKey ? undefined : null, // Could resolve if needed
              convertedContentType: cachedAttachment.convertedContentType,
            });
          } else if (!resolvedUrl) {
            errors.push(item.id);
          }
        } catch (err) {
          console.error(`Failed to resolve URL for attachment ${item.id}:`, err);
          errors.push(item.id);
        }
      }

      if (!cancelled) {
        setResolvedItems(resolved);
        setErrorIds(errors);
        setIsLoading(false);
      }
    };

    resolveAll();

    // Cleanup blob URLs on unmount
    return () => {
      cancelled = true;
      for (const blobUrl of blobUrlsRef.current.values()) {
        URL.revokeObjectURL(blobUrl);
      }
      blobUrlsRef.current.clear();
    };
  }, [items.map((i) => `${i.id}:${i.url ?? ''}`).join(',')]);

  return {
    items: resolvedItems,
    isLoading,
    hasErrors: errorIds.length > 0,
    errorIds,
  };
}
