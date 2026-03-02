/**
 * Scroll to the top of the nearest ancestor with `data-scroll-target`.
 *
 * Place `data-scroll-target` on a wrapper element (e.g. FocusViewContainer,
 * PageTabNav) so that any descendant can call this to scroll the page back
 * to that section — but only when the user has already scrolled past it.
 *
 * An optional pixel offset can be provided via the attribute value
 * (e.g. `data-scroll-target="-80"`) to scroll further up (negative) or down.
 */
export function scrollToNearestTarget(from: Element) {
  const target = from.closest('[data-scroll-target]');
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const offset = Number(target.getAttribute('data-scroll-target')) || 0;
  // Only scroll when the target top is above the viewport (scrolled past)
  if (rect.top < 0) {
    window.scrollTo({ top: window.scrollY + rect.top + offset, behavior: 'instant' });
  }
}
