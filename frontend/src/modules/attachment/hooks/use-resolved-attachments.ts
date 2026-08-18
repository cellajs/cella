import { useIsRestoring } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { Attachment } from 'sdk';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import { PresignRejectedError } from '~/modules/attachment/presign-batch';
import { findAttachmentInCache } from '~/modules/attachment/query';

type AttachmentMetaFields = Pick<Attachment, 'keys' | 'publicBucket' | 'organizationId' | 'tenantId'>;

/** A carousel item that may already carry its own attachment metadata (group/single items do). */
type ResolvableItem = Partial<CarouselItemData> & Partial<AttachmentMetaFields> & { id: string };

/** Transient failures (blob mid-download, cache mid-sync) get a few retries before "not found". */
const RESOLVE_RETRY_LIMIT = 3;
const RESOLVE_RETRY_DELAY_MS = 600;

interface ResolvedAttachmentsResult {
  items: CarouselItemData[];
  isLoading: boolean;
  hasErrors: boolean;
  errorIds: string[];
}

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

/** Resolves carousel item URLs offline-first, waiting for cache restoration before reporting not found. */
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

      const newBlobUrls = new Map<string, string>();

      // Items resolve concurrently so cloud misses coalesce into one presign batch, each catching its own failure.
      type Outcome = { data: CarouselItemData } | { errorId: string; permanent: boolean };
      const outcomes: Outcome[] = await Promise.all(
        items.map(async (item): Promise<Outcome> => {
          if (item.url) return { data: buildItemData(item, item.url, item.url.startsWith('blob:')) };

          // Reuse existing blob URL to avoid revoking URLs still shown in <img> elements
          const existingUrl = blobUrlsRef.current.get(item.id);
          if (existingUrl) {
            newBlobUrls.set(item.id, existingUrl);
            return { data: buildItemData(item, existingUrl, true) };
          }

          try {
            // The list cache holds fresher metadata; group and single items carry full keys as fallback.
            const cachedMeta = findAttachmentInCache(item.id);
            const meta = cachedMeta ?? (item.keys?.original ? (item as AttachmentMetaFields) : null);

            const result = await resolveAttachmentUrl(item.id, meta, { preferredVariant: 'converted' });
            if (result) {
              if (result.isLocal) newBlobUrls.set(item.id, result.url);
              return { data: buildItemData(item, result.url, result.isLocal) };
            }
            // cachedMeta/itemKey separate a cache miss (both false) from a resource with no cloud key whose local blob is gone.
            console.warn(
              `[useResolvedAttachments] Unresolvable attachment ${item.id} (no local blob and no cloud URL, ` +
                `cachedMeta=${!!cachedMeta}, itemKey=${!!item.keys?.original})`,
            );
            return { errorId: item.id, permanent: false };
          } catch (err) {
            console.error(`Failed to resolve URL for attachment ${item.id}:`, err);
            // A server-rejected id (denied or deleted) will not change on retry.
            return { errorId: item.id, permanent: err instanceof PresignRejectedError };
          }
        }),
      );

      if (!cancelled) {
        const resolved = outcomes.flatMap((outcome) => ('data' in outcome ? [outcome.data] : []));
        const errors = outcomes.flatMap((outcome) => ('errorId' in outcome ? [outcome.errorId] : []));
        const hasTransientErrors = outcomes.some((outcome) => 'errorId' in outcome && !outcome.permanent);

        // Revoke blob URLs absent from the active item set.
        for (const [id, url] of blobUrlsRef.current) {
          if (!newBlobUrls.has(id)) URL.revokeObjectURL(url);
        }
        blobUrlsRef.current = newBlobUrls;
        setResolvedItems(resolved);
        setErrorIds(errors);
        setIsLoading(false);

        // Retries are bounded per item set: a transient failure means the blob is still downloading or the cache is mid-sync.
        if (hasTransientErrors && retryCountRef.current < RESOLVE_RETRY_LIMIT) {
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

  useEffect(() => {
    return () => {
      for (const url of blobUrlsRef.current.values()) URL.revokeObjectURL(url);
      blobUrlsRef.current.clear();
    };
  }, []);

  return { items: resolvedItems, isLoading, hasErrors: errorIds.length > 0, errorIds };
}
