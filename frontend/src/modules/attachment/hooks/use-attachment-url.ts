/**
 * Hook to resolve attachment URL, preferring local blob over cloud.
 *
 * Resolution order:
 * 1. Local blob in IndexedDB (uploads or cached downloads)
 * 2. Cloud presigned URL (if online and available)
 *
 * Handles blob URL cleanup on unmount to prevent memory leaks.
 */
import { useEffect, useState } from 'react';
import type { Attachment } from '~/api.gen';
import { getPresignedUrl } from '~/api.gen/sdk.gen';
import { attachmentStorage } from '~/modules/attachment/dexie/storage-service';

export interface UseAttachmentUrlOptions {
  /** Skip URL resolution (e.g., when not visible) */
  skip?: boolean;
  /** Force cloud URL even if local exists */
  preferCloud?: boolean;
}

export interface UseAttachmentUrlResult {
  /** Resolved URL (blob: or https:) */
  url: string | null;
  /** Whether URL is from local blob */
  isLocal: boolean;
  /** Whether resolution is in progress */
  isLoading: boolean;
  /** Error if resolution failed */
  error: Error | null;
}

/**
 * Resolves an attachment URL, checking local storage first.
 */
export function useAttachmentUrl(
  attachment: Pick<Attachment, 'id' | 'originalKey' | 'public'> | null | undefined,
  options: UseAttachmentUrlOptions = {},
): UseAttachmentUrlResult {
  const { skip = false, preferCloud = false } = options;

  const [url, setUrl] = useState<string | null>(null);
  const [isLocal, setIsLocal] = useState(false);
  const [isLoading, setIsLoading] = useState(!skip);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (skip || !attachment) {
      setIsLoading(false);
      return;
    }

    let blobUrl: string | null = null;
    let cancelled = false;

    const resolve = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Try local blob first (unless preferCloud)
        if (!preferCloud) {
          const localUrl = await attachmentStorage.createBlobUrl(attachment.id);

          if (!cancelled && localUrl) {
            blobUrl = localUrl;
            setUrl(localUrl);
            setIsLocal(true);
            setIsLoading(false);
            return;
          }
        }

        // Fall back to cloud URL
        if (!cancelled && attachment.originalKey) {
          const cloudUrl = await getPresignedUrl({
            query: {
              key: attachment.originalKey,
              isPublic: attachment.public,
            },
          });

          if (!cancelled) {
            setUrl(cloudUrl);
            setIsLocal(false);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    resolve();

    // Cleanup: revoke blob URL on unmount or when attachment changes
    return () => {
      cancelled = true;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [attachment?.id, attachment?.originalKey, attachment?.public, skip, preferCloud]);

  return { url, isLocal, isLoading, error };
}

/**
 * Batch resolve URLs for multiple attachments.
 * Useful for galleries/carousels where you want to resolve all at once.
 */
export function useAttachmentUrls(
  attachments: Array<Pick<Attachment, 'id' | 'originalKey' | 'public'>> | null | undefined,
  options: UseAttachmentUrlOptions = {},
): Map<string, UseAttachmentUrlResult> {
  const { skip = false, preferCloud = false } = options;

  const [results, setResults] = useState<Map<string, UseAttachmentUrlResult>>(new Map());
  const [blobUrls, setBlobUrls] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (skip || !attachments?.length) {
      setResults(new Map());
      return;
    }

    let cancelled = false;
    const newBlobUrls = new Map<string, string>();

    const resolveAll = async () => {
      const newResults = new Map<string, UseAttachmentUrlResult>();

      // Initialize all as loading
      for (const att of attachments) {
        newResults.set(att.id, { url: null, isLocal: false, isLoading: true, error: null });
      }
      setResults(new Map(newResults));

      // Resolve each attachment
      for (const attachment of attachments) {
        if (cancelled) break;

        try {
          let resolvedUrl: string | null = null;
          let isLocalUrl = false;

          // Try local first
          if (!preferCloud) {
            const localUrl = await attachmentStorage.createBlobUrl(attachment.id);
            if (localUrl) {
              resolvedUrl = localUrl;
              isLocalUrl = true;
              newBlobUrls.set(attachment.id, localUrl);
            }
          }

          // Fall back to cloud
          if (!resolvedUrl && attachment.originalKey) {
            resolvedUrl = await getPresignedUrl({
              query: {
                key: attachment.originalKey,
                isPublic: attachment.public,
              },
            });
          }

          if (!cancelled) {
            newResults.set(attachment.id, {
              url: resolvedUrl,
              isLocal: isLocalUrl,
              isLoading: false,
              error: null,
            });
            setResults(new Map(newResults));
          }
        } catch (err) {
          if (!cancelled) {
            newResults.set(attachment.id, {
              url: null,
              isLocal: false,
              isLoading: false,
              error: err instanceof Error ? err : new Error(String(err)),
            });
            setResults(new Map(newResults));
          }
        }
      }

      setBlobUrls(newBlobUrls);
    };

    resolveAll();

    // Cleanup blob URLs
    return () => {
      cancelled = true;
      for (const blobUrl of blobUrls.values()) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [attachments?.map((a) => a.id).join(','), skip, preferCloud]);

  return results;
}
