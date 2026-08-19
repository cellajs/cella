/**
 * Writes how much of the layout viewport is hidden at the bottom (on-screen keyboard, browser chrome, URL bar) to
 * `--vv-bottom` on <html>. Fixed-to-bottom UI consumes it through `--bottom-inset` in tailwind.css.
 */
/** Occlusions below this are browser chrome (URL bar ~56px), which fixed elements already track natively;
 * during its show/hide animation innerHeight lags visualViewport.height, so compensating would double up.
 * Only keyboard-sized occlusion needs compensation. */
const MIN_KEYBOARD_PX = 100;

export const initViewportObserver = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let rafId = 0;
  let lastHidden = -1;

  const update = () => {
    rafId = 0;
    const occluded = Math.round(window.innerHeight - viewport.height - viewport.offsetTop);
    const hidden = occluded < MIN_KEYBOARD_PX ? 0 : occluded;
    if (hidden === lastHidden) return;
    lastHidden = hidden;
    document.documentElement.style.setProperty('--vv-bottom', `${hidden}px`);
  };

  const schedule = () => {
    if (!rafId) rafId = requestAnimationFrame(update);
  };

  viewport.addEventListener('resize', schedule);
  viewport.addEventListener('scroll', schedule);
  window.addEventListener('orientationchange', schedule);
  update();
};
