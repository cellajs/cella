/**
 * Track the visual viewport and write how much of the layout viewport is hidden at the
 * bottom (on-screen keyboard, overlaying browser chrome in webviews, URL bar transitions)
 * to `--vv-bottom` on <html>. Fixed-to-bottom UI consumes it through `--bottom-inset`
 * (tailwind.css) so it stays visible when `position: fixed` and the visible viewport disagree.
 *
 * JS writes, CSS reads: no React state, no re-renders.
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
