import { AnimatePresence, motion } from 'motion/react';
import { useEffect } from 'react';
import { useSpotlighter } from '~/modules/common/spotlighter/use-spotlighter';

const closeTop = () => {
  const { stack } = useSpotlighter.getState();
  stack[stack.length - 1]?.onClose();
};

/** The one page-dim layer, mounted in AppLayout beside the other global layers (see use-spotlighter.ts). */
export function Spotlighter() {
  const hasActive = useSpotlighter((state) => state.stack.length > 0);

  useEffect(() => {
    if (!hasActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      // Leave Esc to whatever is layered on top (dropdowns, dialogs, the editor's own handling)
      if (event.key === 'Escape' && !event.defaultPrevented) closeTop();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hasActive]);

  return (
    <AnimatePresence>
      {hasActive && (
        <motion.div
          className="fixed inset-0 z-110 bg-black/40"
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
