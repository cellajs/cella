import { type ReactNode, useLayoutEffect, useRef } from 'react';

/**
 * Holds the slot's last non-empty height while its content is empty for a moment (the editor swapping for the static
 * description), so the card does not reflow. It sets only a min-height, outside React state so children never
 * re-render, and drops it once the content stays empty: an empty description settles to its natural size.
 */
export function PreserveDescriptionHeight({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    let releaseTimer = 0;
    const hasContent = () => (inner.textContent?.trim().length ?? 0) > 0 || inner.querySelector('img, svg') !== null;

    // The height comes from the observer's entry, never from offsetHeight: a board mounts dozens of these in one commit,
    // and each read after the previous one's write would lay out the whole board again.
    const resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry || !hasContent()) return;
      clearTimeout(releaseTimer);
      outer.style.minHeight = `${entry.contentRect.height}px`;
    });
    resizeObserver.observe(inner);
    const mutationObserver = new MutationObserver(() => {
      clearTimeout(releaseTimer);
      if (hasContent()) return;
      releaseTimer = window.setTimeout(() => {
        outer.style.minHeight = '';
      }, 150);
    });
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
