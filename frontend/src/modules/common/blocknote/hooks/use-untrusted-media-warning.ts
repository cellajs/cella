import i18n from 'i18next';
import { useRef } from 'react';
import { hasUntrustedMediaUrls } from '~/modules/common/blocknote/helpers/validate-media-urls';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Warns once per untrusted-media "episode": the warned flag resets once the document is free of untrusted
 * media, so a later occurrence warns again.
 */
export function useUntrustedMediaWarning() {
  const hasWarnedRef = useRef(false);

  return (document: CustomBlockNoteEditor['document']) => {
    const hasUntrustedMedia = hasUntrustedMediaUrls(document);
    if (hasUntrustedMedia && !hasWarnedRef.current) {
      toaster(i18n.t('error:untrusted_media_url'), 'warning');
      hasWarnedRef.current = true;
    } else if (!hasUntrustedMedia) {
      hasWarnedRef.current = false;
    }
  };
}
