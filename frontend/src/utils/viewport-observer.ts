/**
 * Writes how much of the layout viewport is hidden at the bottom (on-screen keyboard, browser chrome, URL bar) to
 * `--vv-bottom` on <html>. Fixed-to-bottom UI consumes it through `--bottom-inset` in tailwind.css.
 */

/** While browser chrome animates in or out, innerHeight lags visualViewport.height by up to the chrome height
 * (~56px). Fixed elements catch up natively once the animation ends, so compensating mid-animation would double
 * up. Occlusions below this size are therefore ignored until the viewport has settled; only a keyboard-sized
 * occlusion is applied immediately. */
const MIN_KEYBOARD_PX = 100;

/** Quiet time after the last viewport event before a small occlusion counts as real: browser chrome that overlays
 * the page, which fixed elements do not track. */
const SETTLE_MS = 300;

export const initViewportObserver = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let rafId = 0;
  let settleId = 0;
  let lastHidden = -1;

  const measure = (settled: boolean) => {
    // Pinch zoom shrinks the visual viewport without hiding anything under it; fixed UI stays in the layout
    // viewport, so any "occlusion" measured now would push it toward the middle of the screen.
    if (viewport.scale > 1.01) return 0;
    // Rubber-band overscroll drives offsetTop negative, which would inflate the occlusion.
    const offsetTop = Math.max(0, viewport.offsetTop);
    const occluded = Math.max(0, Math.round(window.innerHeight - viewport.height - offsetTop));
    if (occluded >= MIN_KEYBOARD_PX || settled) return occluded;
    return 0;
  };

  const write = (settled: boolean) => {
    const hidden = measure(settled);
    if (hidden === lastHidden) return;
    lastHidden = hidden;
    document.documentElement.style.setProperty('--vv-bottom', `${hidden}px`);
  };

  const update = () => {
    rafId = 0;
    write(false);
  };

  const settle = () => {
    settleId = 0;
    write(true);
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(update);
    if (settleId) clearTimeout(settleId);
    settleId = window.setTimeout(settle, SETTLE_MS);
  };

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  // A stale value can survive a bfcache restore or a tab switch (keyboard gone, no resize delivered): resync.
  window.addEventListener('pageshow', schedule);
  document.addEventListener('visibilitychange', schedule);
  schedule();
};
