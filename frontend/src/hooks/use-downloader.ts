import { useState } from 'react';
import { downloadFile } from '~/lib/export';

/** Saves a URL as a file: fetches it and hands the blob to the browser's download. A failed fetch lands in `error`. */
export function useDownloader() {
  const [isInProgress, setIsInProgress] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const download = async (url: string, filename: string) => {
    if (isInProgress) return;
    setIsInProgress(true);
    setError(null);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      downloadFile(filename, await response.blob());
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error(String(cause)));
    } finally {
      setIsInProgress(false);
    }
  };

  return { download, error, isInProgress };
}
