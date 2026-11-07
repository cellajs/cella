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

/** On a `contentKey` change the old content fades out at its scroll position, then the new fades in at the top; no key renders as is. */
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
