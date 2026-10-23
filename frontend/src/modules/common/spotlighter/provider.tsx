import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { spotlighter, useSpotlighter } from '~/modules/common/spotlighter/use-spotlighter';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

const closeTop = () => {
  const { stack } = spotlighter.getState();
  stack[stack.length - 1]?.onClose();
};

/** The one page-dim layer, mounted in AppLayout beside the other global layers (see use-spotlighter.ts). */
export function Spotlighter() {
  const hasSpotlight = useSpotlighter((state) => state.stack.length > 0);

  useEffect(() => {
    if (!hasSpotlight) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      // Leave Esc to whatever is layered on top (dropdowns, dialogs, the editor's own handling, an open tooltip or hover card)
      if (event.key === 'Escape' && !event.defaultPrevented && !isHoverContentOpen()) closeTop();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasSpotlight]);

  return (
    <AnimatePresence>
      {hasSpotlight && (
        <motion.div
          className="fixed inset-0 z-110 bg-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={closeTop}
          aria-hidden="true"
        />
      )}
    </AnimatePresence>
  );
}
