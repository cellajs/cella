import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Attachment } from 'sdk';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import { findAttachmentInCache } from '~/modules/attachment/query';

/** Cloud-key fields needed to resolve a URL without the react-query cache. */
type AttachmentMetaFields = Pick<
  Attachment,
  'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public' | 'organizationId' | 'tenantId'
>;

/** A carousel item that may already carry its own attachment metadata (group/single items do). */
type ResolvableItem = Partial<CarouselItemData> & Partial<AttachmentMetaFields> & { id: string };

/** Transient failures (blob mid-download, cache mid-sync) get a few silent retries before "not found". */
const RESOLVE_RETRY_LIMIT = 3;
const RESOLVE_RETRY_DELAY_MS = 600;

interface ResolvedAttachmentsResult {
  items: CarouselItemData[];
  isLoading: boolean;
  hasErrors: boolean;
  errorIds: string[];
}

/** Build CarouselItemData with metadata from cache */
function buildItemData(
  item: Partial<CarouselItemData> & { id: string },
  url: string,
  isLocal: boolean,
): CarouselItemData {
  const cached = findAttachmentInCache(item.id);
  return {
    id: item.id,
    url,
    isLocal,
    name: item.name ?? cached?.name ?? item.filename ?? 'Attachment',
    filename: item.filename ?? cached?.filename,
    contentType: item.contentType ?? cached?.contentType,
    convertedContentType: item.convertedContentType || cached?.convertedContentType || null,
  };
}

/**
 * Resolves attachment URLs for carousel items using offline-first approach.
 * Waits for cache restoration before declaring items as not found.
 */
export function useResolvedAttachments(items: ResolvableItem[]): ResolvedAttachmentsResult {
  const [resolvedItems, setResolvedItems] = useState<CarouselItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorIds, setErrorIds] = useState<string[]>([]);
  const isRestoring = useIsRestoring();
  const blobUrlsRef = useRef<Map<string, string>>(new Map());

  // Bumped to re-run resolution after a transient failure; reset when the item set changes.
  const [retrySignal, setRetrySignal] = useState(0);
  const retryCountRef = useRef(0);
  const itemsKey = items.map((i) => `${i.id}:${i.url ?? ''}:${i.name ?? ''}`).join(',');

  // Fresh retry budget whenever the set of items changes.
  useEffect(() => {
    retryCountRef.current = 0;
  }, [itemsKey]);

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
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const resolveAll = async () => {
      if (!resolvedItems.length) setIsLoading(true);

      const errors: string[] = [];
      const resolved: CarouselItemData[] = [];
      const newBlobUrls = new Map<string, string>();

      for (const item of items) {
        if (cancelled) break;

        // Already has URL, use directly.
        if (item.url) {
          resolved.push(buildItemData(item, item.url, item.url.startsWith('blob:')));
          continue;
        }

        // Reuse existing blob URL to avoid revoking URLs still shown in <img> elements
        const existingUrl = blobUrlsRef.current.get(item.id);
        if (existingUrl) {
          newBlobUrls.set(item.id, existingUrl);
          resolved.push(buildItemData(item, existingUrl, true));
          continue;
        }

        try {
          // Prefer the list cache's fresher metadata, but fall back to the item's own keys
          // (group/single are full attachments) so a dropped cache entry doesn't show "not found".
          const cachedMeta = findAttachmentInCache(item.id);
          const meta = cachedMeta ?? (item.originalKey ? (item as AttachmentMetaFields) : null);

          const result = await resolveAttachmentUrl(item.id, meta, { preferredVariant: 'converted' });
          if (result) {
            if (result.isLocal) newBlobUrls.set(item.id, result.url);
            resolved.push(buildItemData(item, result.url, result.isLocal));
          } else {
            // Make the otherwise-silent failure diagnosable: cachedMeta/itemKey tell us whether this
            // is a cache miss (both false) or a no-cloud-key resource whose local blob is gone.
            console.warn(
              `[useResolvedAttachments] Unresolvable attachment ${item.id} — no local blob and no cloud URL ` +
                `(cachedMeta=${!!cachedMeta}, itemKey=${!!item.originalKey})`,
            );
            errors.push(item.id);
          }
        } catch (err) {
          console.error(`Failed to resolve URL for attachment ${item.id}:`, err);
          errors.push(item.id);
        }
      }

      if (!cancelled) {
        // Revoke blob URLs absent from the active item set.
        for (const [id, url] of blobUrlsRef.current) {
          if (!newBlobUrls.has(id)) URL.revokeObjectURL(url);
        }
        blobUrlsRef.current = newBlobUrls;
        setResolvedItems(resolved);
        setErrorIds(errors);
        setIsLoading(false);

        // Retry transient failures a few times before letting the dialog show "not found". The
        // blob may still be downloading or the cache mid-sync. Bounded per item-set to avoid loops.
        if (errors.length > 0 && retryCountRef.current < RESOLVE_RETRY_LIMIT) {
          retryCountRef.current += 1;
          retryTimer = setTimeout(() => setRetrySignal((v) => v + 1), RESOLVE_RETRY_DELAY_MS);
        }
      }
    };

    resolveAll();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [itemsKey, isRestoring, retrySignal]);

  // Revoke all blob URLs only on unmount
  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      blobUrlsRef.current.clear();
    };
  }, []);

  return { items: resolvedItems, isLoading, hasErrors: errorIds.length > 0, errorIds };
}
