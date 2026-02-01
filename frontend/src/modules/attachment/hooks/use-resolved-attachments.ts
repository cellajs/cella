/**
 * Hook to resolve URLs for multiple attachments (carousel/dialog use case).
 * Uses resolveAttachmentUrl() core function with cache restoration awareness.
 */
import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { CarouselItemData } from '~/modules/attachment/carousel';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers';
import { findAttachmentInListCache } from '~/modules/attachment/query';

export interface ResolvedAttachmentsResult {
  items: CarouselItemData[];
  isLoading: boolean;
  hasErrors: boolean;
  errorIds: string[];
}

/**
 * Resolves attachment URLs for carousel items using offline-first approach.
 * Waits for cache restoration before declaring items as not found.
 */
export function useResolvedAttachments(
  items: Array<Partial<CarouselItemData> & { id: string }>,
): ResolvedAttachmentsResult {
  const [resolvedItems, setResolvedItems] = useState<CarouselItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorIds, setErrorIds] = useState<string[]>([]);
  const isRestoring = useIsRestoring();
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (isRestoring) {
      setIsLoading(true);
      return;
    }

    if (!items.length) {
      setResolvedItems([]);
      setIsLoading(false);
      setErrorIds([]);
      return;
    }

    // Cleanup previous blob URLs
    for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
    blobUrlsRef.current.clear();

    let cancelled = false;

    const resolveAll = async () => {
      setIsLoading(true);
      const errors: string[] = [];
      const resolved: CarouselItemData[] = [];

      for (const item of items) {
        if (cancelled) break;

        // Already has URL - use directly
        if (item.url) {
          resolved.push(item as CarouselItemData);
          continue;
        }

        try {
          const result = await resolveAttachmentUrl(item.id, null, { preferredVariant: 'converted' });

          if (result) {
            if (result.isLocal) blobUrlsRef.current.set(item.id, result.url);

            // Get metadata from cache for display
            const cached = findAttachmentInListCache(item.id);
            resolved.push({
              id: item.id,
              url: result.url,
              name: item.name ?? cached?.name ?? item.filename ?? 'Attachment',
              filename: item.filename ?? cached?.filename,
              contentType: item.contentType ?? cached?.contentType,
              convertedUrl: cached?.convertedKey ? undefined : null,
              convertedContentType: item.convertedContentType ?? cached?.convertedContentType,
            });
          } else {
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

    return () => {
      cancelled = true;
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      blobUrlsRef.current.clear();
    };
  }, [items.map((i) => `${i.id}:${i.url ?? ''}`).join(','), isRestoring]);

  return { items: resolvedItems, isLoading, hasErrors: errorIds.length > 0, errorIds };
}
