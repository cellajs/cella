import { useEffect, useRef, useState } from 'react';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';
import { useBlobStore } from '~/store/blob'; // Import the Zustand store

/**
 *
 * @param key Key used to get the file from indexedDB
 * @param contentType
 * @returns
 */
export const useLocalFile = (key: string, contentType?: string): { localUrl: string; localFileError: string | null } => {
  // We use the Zustand store to get and set the blob URL after LocalFileStorage has created it. It also revokes the URL user closes the browser tab.
  const { getBlobUrl, setBlobUrl } = useBlobStore();

  // State
  const [fileUrl, setFileUrl] = useState<string>('');
  const [error, setError] = useState<string | null>(null); // New error state
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    const cachedUrl = getBlobUrl(key);

    // If the URL is already cached in Blob store, we can use it directly
    if (cachedUrl) {
      setFileUrl(cachedUrl);
      return;
    }

    // Fetch the file from indexedDB and create a blob URL
    const fetchFile = async () => {
      try {
        const file = await LocalFileStorage.getFile(key);
        if (!file)
          setError(
            'File not found. The file is stored locally in the browser where it was originally loaded and might not be accessible in other browsers or devices.',
          );
        if (file && isMounted.current) {
          const blob = new Blob([file.data], { type: contentType || 'application/octet-stream' });
          const newUrl = URL.createObjectURL(blob);
          setBlobUrl(key, newUrl);
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
  }, [key, contentType, getBlobUrl, setBlobUrl]);

  return { localUrl: fileUrl, localFileError: error };
};
