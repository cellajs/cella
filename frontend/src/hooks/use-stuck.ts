import { type RefObject, useEffect } from 'react';

/**
 * Sets `data-stuck` on a sticky element while scrolling has pinned it away from its place in the flow. Read from
 * `offsetTop`, which takes in the sticky offset but no transform, so an overlay's entrance zoom leaves it alone.
 */
export function useStuck(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    const restTop = element.offsetTop;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => element.toggleAttribute('data-stuck', element.offsetTop > restTop));
    };

    // Scroll events do not bubble; a capture listener on the window hears the overlay's own scroller and the page alike
    window.addEventListener('scroll', update, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, { capture: true });
    };
  }, [enabled]);
}
