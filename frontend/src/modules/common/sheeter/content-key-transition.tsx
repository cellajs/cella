import { AnimatePresence, motion, PresenceContext } from 'motion/react';
import type { ReactNode } from 'react';

/** Ref callback that starts mounting content at the top of its sheet's scroll container; stable, so only mounts call it. */
function scrollToTop(element: HTMLElement | null) {
  const scroller = element?.closest('[data-slot="scroll-area-viewport"], [data-slot="drawer-content"]');
  if (scroller) scroller.scrollTop = 0;
}

interface ContentKeyTransitionProps {
  contentKey?: string;
  children: ReactNode;
}

/**
 * Fades in new content when `contentKey` changes; without a key the content renders as is. The old content fades out
 * first, at its own scroll position, and the new content then starts at the top.
 */
export function ContentKeyTransition({ contentKey, children }: ContentKeyTransitionProps) {
  if (!contentKey) return children;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={contentKey}
        ref={scrollToTop}
        className="flex flex-1 flex-col"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.15 } }}
        exit={{ opacity: 0, transition: { duration: 0.08 } }}
      >
        {/* Parts with an `exit` of their own leave with this content: one that mounts while it fades out would hold the swap forever */}
        <PresenceContext.Provider value={null}>{children}</PresenceContext.Provider>
      </motion.div>
    </AnimatePresence>
  );
}
