import { useEffect, useRef, useState } from 'react';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { useBlobStore } from '~/store/blob'; // Import the Zustand store

/**
 * Custom hook to retrieve a local file from IndexedDB and generate a blob URL.
 *
 * @param attachmentId  used to get file from IndexedDB.
 * @param contentType Optional content type of file.
 * @returns Object containing local file URL and any error encountered.
 */
export const useLocalFile = (attachmentId: string, contentType?: string): { localUrl: string; localFileError: string | null } => {
  // We use store to get and set blob URL after LocalFileStorage created it. It also revokes URL once user closes browser tab.
  const { getBlobUrl, setBlobUrl } = useBlobStore();

  // State
  const [fileUrl, setFileUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const cachedUrl = getBlobUrl(attachmentId);

    // If the URL is already cached in Blob store, we can use it directly
    if (cachedUrl) {
      setFileUrl(cachedUrl);
      return;
    }

    // Fetch the file from IndexedDB
    const fetchFile = async () => {
      try {
        const file = await LocalFileStorage.getFile(attachmentId);
        if (!file)
          setError(
            'File not found. The file is stored locally in the browser where it was originally loaded and might not be accessible in other browsers or devices.',
          );
        if (file && isMounted.current) {
          const blob = new Blob([file.data], { type: contentType || 'application/octet-stream' });
          const newUrl = URL.createObjectURL(blob);
          setBlobUrl(attachmentId, newUrl);
          setFileUrl(newUrl);
        }
      } catch (error) {
        console.error('Error fetching file from FileStorage:', error);
        if (error instanceof Error) setError(`Error loading file: ${error.message}`);
      }
    };

    fetchFile();

    return () => {
      isMounted.current = false;
    };
  }, [attachmentId, contentType, getBlobUrl, setBlobUrl]);

  return { localUrl: fileUrl, localFileError: error };
};
