/** Nearest ancestor of `node` whose overflow-y scrolls, or `window` when none is found before `document.body`. */
export function getScrollParent(node: HTMLElement): HTMLElement | Window {
  let parent: HTMLElement | null = node;
  // biome-ignore lint/suspicious/noAssignInExpressions: required for short-circuit assignment pattern
  while ((parent = parent.parentElement)) {
    if (parent === document.body) return window;
    const overflowY = getComputedStyle(parent).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return parent;
  }
  return window;
}

/** Scroll offset of a scroll parent from `getScrollParent`. */
export const scrollTopOf = (scrollParent: HTMLElement | Window) => (scrollParent instanceof Window ? scrollParent.scrollY : scrollParent.scrollTop);

/** Viewport position of a scroll parent's top edge: 0 for the window. */
export const viewportTopOf = (scrollParent: HTMLElement | Window) => (scrollParent instanceof Window ? 0 : scrollParent.getBoundingClientRect().top);
