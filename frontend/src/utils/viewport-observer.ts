/**
 * Marks an open on-screen keyboard with a `keyboard-open` class on <body>, so fixed-to-bottom UI hides through the
 * `chrome-hidden:` variant. The class flips only when the state does: on iOS the measurement changes every frame while
 * the keyboard moves, and a class write on <body> restyles everything.
 */

/** Fixed UI follows browser chrome (URL bar, toolbars) natively; a smaller occlusion is chrome animation lag, so only a keyboard counts. */
const minKeyboardPx = 100;

export const initViewportObserver = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let rafId = 0;
  let keyboardOpen = false;

  const measure = () => {
    // Pinch zoom shrinks the visual viewport without hiding anything under it, which would read as a keyboard.
    if (viewport.scale > 1.01) return false;
    // The height alone: scrolling pans the visual viewport down the layout viewport, which raises offsetTop under an open keyboard.
    return window.innerHeight - viewport.height >= minKeyboardPx;
  };

  const update = () => {
    rafId = 0;
    const open = measure();
    if (open === keyboardOpen) return;
    keyboardOpen = open;
    document.body.classList.toggle('keyboard-open', open);
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  };

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  // innerHeight can change on its own event, after the visual viewport has gone quiet
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  // A stale value can survive a bfcache restore or a tab switch (keyboard gone, no resize delivered): measure again.
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
};
