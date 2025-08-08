import * as Sentry from '@sentry/react';
import DOMPurify from 'dompurify';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LocalFileStorage } from '~/modules/attachments/helpers/local-file-storage';
import { useBlobStore } from '~/store/blob';
import { isCDNUrl } from '~/utils/is-cdn-url';

/**
 * Custom hook for usable attachment URL, handling both remote and locally stored files.
 *
 * - If the base URL is a trusted remote path (e.g. static or CDN), it returns that directly.
 * - If the file is stored locally (e.g. IndexedDB via LocalFileStorage), it creates a Blob URL.
 * - Uses a shared blob URL cache via Zustand (`useBlobStore`) to avoid redundant blob creation.
 * - Returns any error encountered when accessing or generating the local file.
 *
 * @param id Unique attachment ID (used to retrieve local file or cache blob URL).
 * @param baseUrl Original URL or path to sanitize and resolve.
 * @param type MIME type used when generating a Blob from local data.
 *
 * @returns `{ url: string | null, error: string | null}`
 */
export const useAttachmentUrl = (id: string, baseUrl: string, type: string) => {
  const { getBlobUrl, setBlobUrl } = useBlobStore();

  const sanitizedUrl = useMemo(() => DOMPurify.sanitize(baseUrl), [baseUrl]);

  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    // Use direct URL for static images either for remote URL
    if (sanitizedUrl.startsWith('/static/') || isCDNUrl(sanitizedUrl)) {
      setUrl(sanitizedUrl);
      return;
    }

    // If URL is already cached in Blob store, we can use it directly
    const cachedUrl = getBlobUrl(id);
    if (cachedUrl) {
      setUrl(cachedUrl);
      return;
    }

    // If  URL is not a remote static path, we assume it's a local file
    const fetchLocal = async () => {
      try {
        const file = await LocalFileStorage.getFile(id);
        if (!file) {
          setError(
            'File not found. The file is stored locally in the browser where it was originally loaded and might not be accessible in other browsers or devices.',
          );
          return;
        }
        if (isMounted.current) {
          const blob = new Blob([file.data], { type: type || 'application/octet-stream' });
          const objectUrl = URL.createObjectURL(blob);
          setBlobUrl(id, objectUrl);
          setUrl(objectUrl);
        }
      } catch (e) {
        console.error(e);
        if (e instanceof Error) {
          Sentry.captureException(e);
          setError(`Failed to load file: ${e.message}`);
        }
      }
    };

    fetchLocal();

    return () => {
      isMounted.current = false;
    };
  }, [id, sanitizedUrl, type]);

  return { url, error };
};
