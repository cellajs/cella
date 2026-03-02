/**
 * Hook to resolve URLs for multiple attachments (carousel/dialog use case).
 * Uses resolveAttachmentUrl() core function with cache restoration awareness.
 * Reuses existing blob URLs to prevent flashes from URL.revokeObjectURL.
 */
import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { CarouselItemData } from '~/modules/attachment/carousel';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers';
import { findAttachmentInCache } from '~/modules/attachment/query';

export interface ResolvedAttachmentsResult {
  items: CarouselItemData[];
  isLoading: boolean;
  hasErrors: boolean;
  errorIds: string[];
}

/** Build CarouselItemData with metadata from cache */
function buildItemData(item: Partial<CarouselItemData> & { id: string }, url: string): CarouselItemData {
  const cached = findAttachmentInCache(item.id);
  return {
    id: item.id,
    url,
    name: item.name ?? cached?.name ?? item.filename ?? 'Attachment',
    filename: item.filename ?? cached?.filename,
    contentType: item.contentType ?? cached?.contentType,
    convertedUrl: cached?.convertedKey ? undefined : null,
    convertedContentType: item.convertedContentType || cached?.convertedContentType || null,
  };
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
      if (!resolvedItems.length) setIsLoading(true);

      const errors: string[] = [];
      const resolved: CarouselItemData[] = [];
      const newBlobUrls = new Map<string, string>();

      for (const item of items) {
        if (cancelled) break;

        // Already has URL — use directly
        if (item.url) {
          resolved.push(buildItemData(item, item.url));
          continue;
        }

        // Reuse existing blob URL to avoid revoking URLs still shown in <img> elements
        const existingUrl = blobUrlsRef.current.get(item.id);
        if (existingUrl) {
          newBlobUrls.set(item.id, existingUrl);
          resolved.push(buildItemData(item, existingUrl));
          continue;
        }

        try {
          const result = await resolveAttachmentUrl(item.id, null, { preferredVariant: 'converted' });
          if (result) {
            if (result.isLocal) newBlobUrls.set(item.id, result.url);
            resolved.push(buildItemData(item, result.url));
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
