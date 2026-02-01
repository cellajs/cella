/**
 * Hook to resolve attachment URL, preferring local blob over cloud.
 * Uses resolveAttachmentUrl() core function for consistent resolution logic.
 */
import { useEffect, useRef, useState } from 'react';
import type { Attachment } from '~/api.gen';
import type { BlobVariant } from '~/modules/attachment/dexie/attachments-db';
import { type ResolveOptions, resolveAttachmentUrl } from '~/modules/attachment/helpers';

export interface UseAttachmentUrlResult {
  url: string | null;
  isLocal: boolean;
  resolvedVariant: BlobVariant | null;
  isLoading: boolean;
  error: Error | null;
}

export interface UseAttachmentUrlOptions extends ResolveOptions {
  skip?: boolean;
}

/**
 * Resolves an attachment URL with offline-first approach.
 * Checks local IndexedDB blob storage first, falls back to cloud presigned URL.
 */
export function useAttachmentUrl(
  attachment: Pick<Attachment, 'id' | 'originalKey' | 'convertedKey' | 'thumbnailKey' | 'public'> | null | undefined,
  options: UseAttachmentUrlOptions = {},
): UseAttachmentUrlResult {
  const { skip = false, ...resolveOptions } = options;

  const [result, setResult] = useState<UseAttachmentUrlResult>({
    url: null,
    isLocal: false,
    resolvedVariant: null,
    isLoading: !skip && !!attachment,
    error: null,
  });

  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (skip || !attachment) {
      setResult((prev) => ({ ...prev, isLoading: false }));
      return;
    }

    let cancelled = false;

    // Cleanup previous blob URL
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    const resolve = async () => {
      setResult((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const resolved = await resolveAttachmentUrl(attachment.id, attachment, resolveOptions);

        if (!cancelled) {
          if (resolved?.isLocal) blobUrlRef.current = resolved.url;
          setResult({
            url: resolved?.url ?? null,
            isLocal: resolved?.isLocal ?? false,
            resolvedVariant: resolved?.variant ?? null,
            isLoading: false,
            error: null,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setResult({
            url: null,
            isLocal: false,
            resolvedVariant: null,
            isLoading: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      }
    };

    resolve();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [attachment?.id, attachment?.originalKey, skip, resolveOptions.preferCloud, resolveOptions.preferredVariant]);

  return result;
}
