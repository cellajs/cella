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

    let cancelled = false;

    const resolveAll = async () => {
      // Only show loading on initial resolve, not metadata updates
      if (!resolvedItems.length) setIsLoading(true);

      const errors: string[] = [];
      const resolved: CarouselItemData[] = [];
      const newBlobUrls = new Map<string, string>();

      for (const item of items) {
        if (cancelled) break;

        // Already has URL - use directly
        if (item.url) {
          resolved.push({ ...item, url: item.url });
          continue;
        }

        // Reuse existing blob URL if available — avoids revoking URLs
        // still referenced by mounted <img> elements
        const existingBlobUrl = blobUrlsRef.current.get(item.id);

        try {
          if (existingBlobUrl) {
            // Keep existing blob URL, just update metadata from latest cache
            newBlobUrls.set(item.id, existingBlobUrl);
            const cached = findAttachmentInListCache(item.id);
            resolved.push({
              id: item.id,
              url: existingBlobUrl,
              name: item.name ?? cached?.name ?? item.filename ?? 'Attachment',
              filename: item.filename ?? cached?.filename,
              contentType: item.contentType ?? cached?.contentType,
              convertedUrl: cached?.convertedKey ? undefined : null,
              convertedContentType: item.convertedContentType ?? cached?.convertedContentType,
            });
            continue;
          }

          const result = await resolveAttachmentUrl(item.id, null, { preferredVariant: 'converted' });

          if (result) {
            if (result.isLocal) newBlobUrls.set(item.id, result.url);

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
        // Revoke only blob URLs no longer in use
        for (const [id, url] of blobUrlsRef.current) {
          if (!newBlobUrls.has(id)) URL.revokeObjectURL(url);
        }
        blobUrlsRef.current = newBlobUrls;

        setResolvedItems(resolved);
        setErrorIds(errors);
        setIsLoading(false);
      }
    };

    resolveAll();

    return () => {
      cancelled = true;
    };
  }, [items.map((i) => `${i.id}:${i.url ?? ''}:${i.name ?? ''}`).join(','), isRestoring]);

  // Revoke all blob URLs only on unmount
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      blobUrlsRef.current.clear();
    };
  }, []);

  return { items: resolvedItems, isLoading, hasErrors: errorIds.length > 0, errorIds };
}
