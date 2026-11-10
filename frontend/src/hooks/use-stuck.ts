import { type RefObject, useEffect } from 'react';

/**
 * Sets `data-stuck` on a sticky element while scrolling has pinned it away from its place in the flow. Read from
 * `offsetTop`, which takes in the sticky offset but no transform, so an overlay's entrance zoom leaves it alone.
 */
export function useStuck(ref: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element) return;

    // Unpinned for one layout, the element reports its place in the flow at any scroll position
    const measureRest = () => {
      element.style.position = 'relative';
      const top = element.offsetTop;
      element.style.position = '';
      return top;
    };

    let restTop = measureRest();
    let remeasure = false;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (remeasure) restTop = measureRest();
        remeasure = false;
        element.toggleAttribute('data-stuck', element.offsetTop > restTop);
      });
    };
    // A resize can cross a breakpoint that changes the root font size, and with it the padding above the element
    const onResize = () => {
      remeasure = true;
      update();
    };

    // Scroll events do not bubble; a capture listener on the window hears the overlay's own scroller and the page alike
    window.addEventListener('scroll', update, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [enabled]);
}
