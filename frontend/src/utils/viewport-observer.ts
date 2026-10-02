/**
 * Tracks how much of the layout viewport the on-screen keyboard hides at the bottom.
 * Fixed-to-bottom UI subscribes and writes it as `--vv-bottom` on its own element, consumed through `--bottom-inset`
 * in tailwind.css: on iOS it changes every frame while the keyboard is open, and a write on <html> restyles everything.
 */

/** Fixed elements track browser chrome (URL bar, toolbars) natively, so only a keyboard-sized occlusion counts. Smaller
 * ones are chrome animation lag: while the chrome slides in or out, innerHeight and visualViewport.height disagree by
 * up to its height until the browser resizes, which can be well after the last viewport event. */
const MIN_KEYBOARD_PX = 100;

let viewportBottom = 0;
const listeners = new Set<(px: number) => void>();

/** Hidden layout-viewport bottom in px, as last measured. */
export const getViewportBottom = () => viewportBottom;

/** Calls the listener on every change of the hidden bottom; returns the unsubscribe. */
export function subscribeViewportBottom(listener: (px: number) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const initViewportObserver = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let rafId = 0;

  const measure = () => {
    // Pinch zoom shrinks the visual viewport without hiding anything under it; fixed UI stays in the layout
    // viewport, so any "occlusion" measured now would push it toward the middle of the screen.
    if (viewport.scale > 1.01) return 0;
    // Rubber-band overscroll drives offsetTop negative, which would inflate the occlusion.
    const offsetTop = Math.max(0, viewport.offsetTop);
    const occluded = Math.max(0, Math.round(window.innerHeight - viewport.height - offsetTop));
    return occluded >= MIN_KEYBOARD_PX ? occluded : 0;
  };

  const update = () => {
    rafId = 0;
    const hidden = measure();
    if (hidden === viewportBottom) return;
    viewportBottom = hidden;
    for (const listener of listeners) listener(hidden);
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  };

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  // innerHeight can change on its own event, after the visual viewport has gone quiet
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  // A stale value can survive a bfcache restore or a tab switch (keyboard gone, no resize delivered): resync.
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
};
