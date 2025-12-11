import * as Sentry from '@sentry/react';
import i18n from 'i18next';
import { useEffect, useRef, useState } from 'react';
import { dexieAttachmentStorage } from '~/modules/attachments/services/dexie-attachment-storage';
import { useBlobStore } from '~/store/blob'; // Import Zustand store
import { isCDNUrl } from '~/utils/is-cdn-url';
import { sanitizeUrl } from '~/utils/sanitize-url';

/**
 * Custom hook for usable attachment URL, handling both remote and locally stored files.
 *
 * - Always prefers local storage first for offline-first behavior
 * - If the file is stored locally (e.g. IndexedDB via Dexie), it creates a Blob URL.
 * - Falls back to remote URL only if local file is not available
 * - Uses a shared blob URL cache via Zustand (`useBlobStore`) to avoid redundant blob creation.
 * - Returns any error encountered when accessing or generating the local file.
 *
 * @param id Unique attachment ID (used to retrieve local file or cache blob URL).
 * @param baseUrl Original URL or path to sanitize and resolve.
 * @param type MIME type used when generating a Blob from local data.
 * @param organizationId Organization ID for context.
 *
 * @returns `{ url: string | null, error: string | null}`
 */
export const useAttachmentUrl = (id: string, baseUrl: string, type: string, organizationId?: string) => {
  const sanitizedUrl = sanitizeUrl(baseUrl).trim();

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // If URL is already cached in Blob store, we can use it directly
    const cachedUrl = useBlobStore.getState().getBlobUrl(id);
    if (cachedUrl) {
      setUrl(cachedUrl);
      setError(null); // Clear any previous error
      return;
    }

    const fetchLocal = async () => {
      try {
        const attachmentFile = await dexieAttachmentStorage.getFile(id);
        const file = attachmentFile?.file;

        if (attachmentFile && file && file.data) {
          // File found locally - use it
          if (isMounted.current) {
            if (!(file.data instanceof Blob) && !(file.data instanceof File)) {
              throw Error('Invalid file data: expected Blob or File');
            }
            const blob = new Blob([file.data], { type: type || 'application/octet-stream' });
            const objectUrl = URL.createObjectURL(blob);
            useBlobStore.getState().setBlobUrl(id, objectUrl);
            setUrl(objectUrl);
            setError(null); // Clear error on success
          }
        } else {
          // File not found locally - fall back to remote URL
          if (sanitizedUrl.startsWith('/static/') || isCDNUrl(sanitizedUrl)) {
            setUrl(sanitizedUrl);
            setError(null);

            // Trigger preloading for images if organization context is available
            if (organizationId && type?.startsWith('image/')) {
              // Note: We would need attachment metadata here for proper preloading
              // This is a simplified version - in practice you'd pass the full attachment object
            }
          } else {
            setError(i18n.t('error:local_file_not_found'));
            setUrl(null);
          }
        }
      } catch (e) {
        console.error(e);
        if (e instanceof Error) {
          Sentry.captureException(e);
          setError(`Failed to load file: ${e.message}`);
          setUrl(null); // Ensure URL is null on error
        }
      }
    };

    fetchLocal();

    return () => {
      isMounted.current = false;
    };
  }, [id, sanitizedUrl, type, organizationId]);

  return { url, error };
};
