import { useEffect, useState } from 'react';
import { LocalFileStorage } from '~/modules/attachments/local-file-storage';

// Fetch file from IndexedDB and return a Blob URL
export const useLocalFile = (key: string, fileType?: string): string => {
  const [fileUrl, setFileUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    let currentFileUrl = '';

    const fetchFile = async () => {
      try {
        // Retrieve the file using LocalFileStorage
        const file = await LocalFileStorage.getFile(key);

        if (file && isMounted) {
          // Convert file data to a Blob URL
          const blob = new Blob([file.data], { type: fileType || 'application/octet-stream' });
          currentFileUrl = URL.createObjectURL(blob);
          setFileUrl(currentFileUrl);
        }
      } catch (error) {
        console.error('Error fetching file from FileStorage:', error);
      }
    };

    fetchFile();

    return () => {
      isMounted = false;
      if (currentFileUrl) {
        // Revoke the Blob URL to free up memory
        URL.revokeObjectURL(currentFileUrl);
      }
    };
  }, [key, fileType]);

  return fileUrl;
};
