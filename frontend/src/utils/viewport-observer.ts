/**
 * Writes how much of the layout viewport is hidden at the bottom (on-screen keyboard, browser chrome, URL bar) to
 * `--vv-bottom` on <html>. Fixed-to-bottom UI consumes it through `--bottom-inset` in tailwind.css.
 */
export const initViewportObserver = () => {
  const viewport = window.visualViewport;
  if (!viewport) return;

  let rafId = 0;
  let lastHidden = -1;

  const update = () => {
    rafId = 0;
    const hidden = Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
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
