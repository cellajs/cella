import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEventListener } from '~/hooks/use-event-listener';
import { spotlighter, useSpotlighter } from '~/modules/common/spotlighter/use-spotlighter';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

const closeTop = () => {
  const { stack } = spotlighter.getState();
  stack[stack.length - 1]?.onClose();
};

/** The one page-dim layer, mounted in AppLayout beside the other global layers (see use-spotlighter.ts). */
export function Spotlighter() {
  const hasSpotlight = useSpotlighter((state) => state.stack.length > 0);
  const scope = useSpotlighter((state) => state.stack[state.stack.length - 1]?.scope);

  // A closing overlay fades out where it was: a scoped one keeps its scope until it has gone
  const [shownScope, setShownScope] = useState(scope);
  if (hasSpotlight && scope !== shownScope) setShownScope(scope);

  useEventListener(
    'keydown',
    (event) => {
      // Leave Esc to whatever is layered on top (dropdowns, dialogs, the editor's own handling, an open tooltip or hover card)
      if (event.key === 'Escape' && !event.defaultPrevented && !isHoverContentOpen()) closeTop();
    },
    { enabled: hasSpotlight },
  );

  const layer = (
    <AnimatePresence>
      {hasSpotlight && (
        <motion.div
          className={cn('inset-0 z-110 bg-overlay', shownScope ? 'absolute' : 'fixed')}
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

  return shownScope ? createPortal(layer, shownScope) : layer;
}
