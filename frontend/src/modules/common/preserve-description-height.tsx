import { type ReactNode, useLayoutEffect, useRef } from 'react';

/**
 * Holds the slot's last non-empty height while its content is momentarily empty, so a content swap
 * (editor -> static description on leaving edit) cannot collapse and reflow the card. Stores only a
 * pixel height, never content, so it can never show stale text. The height is applied imperatively
 * (no React state) so children never re-render. A hold is released shortly after the content stays
 * empty, so a genuinely empty description settles to its natural size.
 */
export function PreserveDescriptionHeight({ children }: { children: ReactNode }) {
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
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    const mo = new MutationObserver(measure);
    mo.observe(inner, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(releaseTimer);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);

  return (
    <div ref={outerRef}>
      <div ref={innerRef}>{children}</div>
    </div>
  );
}
