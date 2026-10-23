import i18n from 'i18next';
import { useState } from 'react';
import { downloadFile } from '~/lib/export';
import { toaster } from '~/modules/common/toaster/toaster';

/** Saves a URL as a file (`file` when unnamed): fetches it and hands the blob to the browser's download. A failed fetch shows an error toast. */
export function useDownloader() {
  const [isInProgress, setIsInProgress] = useState(false);

  const download = async (url: string, filename?: string) => {
    if (isInProgress) return;
    setIsInProgress(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      downloadFile(filename || 'file', await response.blob());
    } catch {
      toaster.error(i18n.t('error:download_failed'));
    } finally {
      setIsInProgress(false);
    }
  };

  return { download, isInProgress };
}
