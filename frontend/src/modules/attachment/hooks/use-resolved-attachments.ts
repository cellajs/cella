import { useIsRestoring } from '@tanstack/react-query';
import i18n from 'i18next';
import { useEffect, useRef, useState } from 'react';
import type { CarouselItemData } from '~/modules/attachment/attachments-carousel';
import { getPendingUpload, PendingUploadError } from '~/modules/attachment/helpers/pending-uploads';
import { type AttachmentMeta, resolveAttachmentUrl } from '~/modules/attachment/helpers/resolve-url';
import { PresignRejectedError } from '~/modules/attachment/presign-batch';
import { findAttachmentInCache } from '~/modules/attachment/query';

/** A carousel item that may already carry its own attachment metadata (group/single items do). */
export type ResolvableItem = Partial<CarouselItemData> & Partial<AttachmentMeta> & { id: string };

/** Transient failures (blob mid-download, cache mid-sync) get a few retries before "not found". */
const resolveRetryLimit = 3;
const resolveRetryDelayMs = 600;

interface ResolvedAttachmentsResult {
  items: CarouselItemData[];
  isLoading: boolean;
  errorIds: string[];
}

function buildItemData(item: ResolvableItem, url: string, isLocal: boolean): CarouselItemData {
  const cached = findAttachmentInCache(item.id);
  return {
    id: item.id,
    url,
    isLocal,
    name: item.name ?? cached?.name ?? item.filename ?? i18n.t('c:attachment'),
    filename: item.filename ?? cached?.filename,
    contentType: item.contentType ?? cached?.contentType,
    convertedContentType: item.convertedContentType || cached?.convertedContentType || null,
    description: item.description ?? cached?.description ?? null,
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
  const itemsKey = items.map((item) => `${item.id}:${item.url ?? ''}`).join(',');

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
            const meta = cachedMeta ?? (item.keys?.original ? (item as AttachmentMeta) : null);

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
          } catch (error) {
            if (error instanceof PendingUploadError) return { data: { ...buildItemData(item, '', false), pendingUpload: getPendingUpload(item.id) } };
            console.error(`Failed to resolve URL for attachment ${item.id}:`, error);
            // A server-rejected id (denied or deleted) will not change on retry.
            return { errorId: item.id, permanent: error instanceof PresignRejectedError };
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
        if (hasTransientErrors && retryCountRef.current < resolveRetryLimit) {
          retryCountRef.current += 1;
          retryTimer = setTimeout(() => setRetrySignal((signal) => signal + 1), resolveRetryDelayMs);
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

  // Name and description follow the input items as they change; the items key covers only what resolves a URL.
  const liveItems = resolvedItems.map((resolved) => {
    const item = items.find(({ id }) => id === resolved.id);
    return { ...resolved, name: item?.name ?? resolved.name, description: item?.description ?? resolved.description };
  });

  return { items: liveItems, isLoading, errorIds };
}
