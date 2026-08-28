import { useEffect, useRef, useState } from 'react';
import { lazyNamed } from '~/utils/lazy-named';

/** One shared lazy instance so preloading resolves the same wrapper every consumer uses, avoiding a Suspense spinner flash. */
export const BlockNoteFullHtml = lazyNamed(() => import('~/modules/common/blocknote/full-html'), 'BlockNoteFullHtml');

// Once warm, later mounts skip the gate: per-card compute lands within a frame and already-seen
// documents render synchronously from the first-pass cache, so gating again would only add a
// skeleton flash.
let rendererWarm = false;

/**
 * Warms the static document renderer and precomputes the given documents' first-pass HTML,
 * reporting when they can all render at full height in their first commit. Pass `null` while the
 * documents are not known yet. Holding a list's skeleton on this flag turns lazy-chunk load plus
 * per-card async HTML passes (which pop in and re-measure virtualized rows) into one reveal.
 * Flips true once per mount and stays true; later documents compute on demand.
 */
export function useStaticDocumentsReady(documents: string[] | null): boolean {
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
      for (const document of documents) fullHtml.precomputeDocumentHtml(document);
      rendererWarm = true;
      if (mountedRef.current) setReady(true);
    })();
  }, [ready, documents]);
  return ready;
}
