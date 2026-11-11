import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEventListener } from '~/hooks/use-event-listener';
import { spotlighter, useSpotlighter } from '~/modules/common/spotlighter/use-spotlighter';
import { cn } from '~/utils/cn';
import { isHoverContentOpen } from '~/utils/is-hover-content-open';

const closeTop = () => spotlighter.getState().stack.at(-1)?.onClose();

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

  // Stays mounted: `hidden` fades it out through a discrete transition and @starting-style fades it back in
  const layer = (
    <div
      hidden={!hasSpotlight}
      className={cn(
        'bg-overlay inset-0 z-110 transition-[opacity,display] transition-discrete duration-200 starting:opacity-0 [&[hidden]]:opacity-0',
        shownScope ? 'absolute' : 'fixed',
      )}
      onClick={closeTop}
      aria-hidden="true"
    />
  );

  return shownScope ? createPortal(layer, shownScope) : layer;
}
