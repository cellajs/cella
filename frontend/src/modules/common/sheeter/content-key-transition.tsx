import { AnimatePresence, motion } from 'motion/react';
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
 * Slides in new content when `contentKey` changes; without a key the content renders as is. The old content leaves
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
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.1 }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
