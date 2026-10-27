/**
 * Calls `flush` when the tab is hidden and when the page unloads (a reload fires only `pagehide`): the last moments a
 * pending write can still commit. Returns the unsubscribe; a no-op outside the browser.
 */
export function onPageHide(flush: () => void): () => void {
  if (typeof document === 'undefined') return () => {};

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'hidden') flush();
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('pagehide', flush);

  return () => {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('pagehide', flush);
  };
}
