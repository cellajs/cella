import { type ReactNode, useLayoutEffect, useRef } from 'react';

interface PreserveDescriptionHeightProps {
  children: ReactNode;
}

/**
 * Holds the slot's last non-empty height while its content is empty for a moment (the editor swapping for the static
 * description), so the card does not reflow. It sets only a min-height, outside React state so children never
 * re-render, and drops it once the content stays empty: an empty description settles to its natural size.
 */
export function PreserveDescriptionHeight({ children }: PreserveDescriptionHeightProps) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    let releaseTimer = 0;
    const measure = () => {
      const hasContent = (inner.textContent?.trim().length ?? 0) > 0 || inner.querySelector('img, svg') !== null;
      clearTimeout(releaseTimer);
      if (hasContent) {
        outer.style.minHeight = `${inner.offsetHeight}px`;
      } else {
        releaseTimer = window.setTimeout(() => {
          outer.style.minHeight = '';
        }, 150);
      }
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(inner);
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(inner, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(releaseTimer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return (
    <div ref={outerRef}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
