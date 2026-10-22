import { useEffect, useRef, useState } from 'react';
import { lazyNamed } from '~/utils/lazy-named';

/** One shared lazy instance so preloading resolves the same wrapper every consumer uses, avoiding a Suspense spinner flash. */
export const BlockNoteFullHtml = lazyNamed(() => import('~/modules/common/blocknote/full-html'), 'BlockNoteFullHtml');

// Once warm, later mounts skip the gate: a card computes within a frame and a seen document renders from the first-pass cache.
let rendererWarm = false;

/**
 * Warms the static renderer and precomputes the documents' first-pass HTML; true once they all render at full height in their
 * first commit, so a list's skeleton reveals once. Pass `null` until the documents are known, and the organization the renderer
 * receives. Flips true once per mount; later documents compute on demand.
 */
export function useStaticDocumentsReady(documents: string[] | null, organizationId?: string): boolean {
  const [ready, setReady] = useState(rendererWarm);
  const startedRef = useRef(false);
  const mountedRef = useRef(true);
  // Set inside the effect so StrictMode's simulated unmount/remount leaves the flag true.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready || startedRef.current || !documents) return;
    startedRef.current = true;
    (async () => {
      // The async continuation runs outside React's render/commit, which blocksToFullHTML requires.
      const [fullHtml, helpers] = await Promise.all([
        import('~/modules/common/blocknote/full-html'),
        import('~/modules/common/blocknote/helpers/blocknote-helpers'),
      ]);
      if (!mountedRef.current) return;
      helpers.getHeadlessEditor();
      for (const document of documents) fullHtml.precomputeDocumentHtml(document, organizationId);
      rendererWarm = true;
      setReady(true);
    })();
  }, [ready, documents, organizationId]);
  return ready;
}
