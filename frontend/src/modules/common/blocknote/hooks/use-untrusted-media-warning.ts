import i18n from 'i18next';
import { useRef } from 'react';
import type { MediaRefContext } from 'shared/utils/media-ref';
import { hasUntrustedMediaUrls } from 'shared/utils/validate-block-media-urls';
import type { CustomBlockNoteEditor } from '~/modules/common/blocknote/types';
import { toaster } from '~/modules/common/toaster/toaster';

/**
 * Warns once per run of media the grammar refuses (pasted from another site, say), which renders nothing and fails the
 * save: the flag resets once the document is clean, so a later occurrence warns again.
 */
export function useUntrustedMediaWarning(ctx: MediaRefContext) {
  const hasWarnedRef = useRef(false);

  return (document: CustomBlockNoteEditor['document']) => {
    const hasUntrustedMedia = hasUntrustedMediaUrls(document, ctx);
    if (hasUntrustedMedia && !hasWarnedRef.current) {
      toaster.warning(i18n.t('error:untrusted_media_url'));
      hasWarnedRef.current = true;
    } else if (!hasUntrustedMedia) {
      hasWarnedRef.current = false;
    }
  };
}
