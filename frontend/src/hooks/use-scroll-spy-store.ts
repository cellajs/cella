/**
 * DOM id prefix (e.g. id="spy-intro") prevents auto-scroll on hash change. No element may carry the bare section id:
 * TanStack history patches replaceState, so each hash write runs the router's hash scroll, which jumps to that element.
 */
export const spyPrefix = 'spy-';

const sections = new Map<string, number>(); // sectionId → intersection ratio
let observer: IntersectionObserver | null = null;
let currentSection = '';
let hashWriteBlockedUntil = 0;
let initTime = 0;
let pendingScrollTarget: string | null = null;
let scrollSettleTimer = 0;
let savedSection = ''; // Preserved across quick re-registrations (effect re-runs)
// Section a scroll was sent to: stays current until the user scrolls, even where the page can't bring it up to the trigger line
let pinnedSection = '';

// Subscribers for useSyncExternalStore
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

/** Toggles data-spy-active on matching data-spy-link elements, bypassing React to keep scrolling smooth. */
const markActiveLinks = () => {
  for (const element of document.querySelectorAll('[data-spy-active]')) {
    delete (element as HTMLElement).dataset.spyActive;
  }
  if (currentSection) {
    for (const element of document.querySelectorAll(`[data-spy-link="${CSS.escape(currentSection)}"]`)) {
      (element as HTMLElement).dataset.spyActive = '';
    }
  }
};

export const subscribeSection = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getSection = () => currentSection;

const canWriteHash = () => Date.now() > hashWriteBlockedUntil && initTime && Date.now() - initTime > 300;

export const isProgrammaticScroll = () => Date.now() < hashWriteBlockedUntil;

/** Within this many px of the top the page counts as unscrolled: the topmost section is current and the hash is dropped. */
const topThreshold = 64;

let topWatchTarget: HTMLElement | Window | null = null;
let topWatchFrame = 0;

const scrollTopOf = (target: HTMLElement | Window) => (target === window ? window.scrollY : (target as HTMLElement).scrollTop);

const isAtTop = () => scrollTopOf(topWatchTarget ?? window) <= topThreshold;

/** Drop the hash, keeping path and search intact. */
const clearHash = () => {
  if (!location.hash) return;
  history.replaceState(null, '', location.pathname + location.search);
};

/** Near the top the hash is dropped so a reload returns to the top; `currentSection` stays set for the TOC. */
const writeHash = (id: string) => {
  if (!canWriteHash()) return;
  if (isAtTop()) clearHash();
  else if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
};

/** A user scroll releases the pin. The observer misses the final stretch back to the top, so this also clears the hash there. */
const handleScroll = () => {
  if (!isProgrammaticScroll()) pinnedSection = '';
  if (topWatchFrame) return;
  topWatchFrame = requestAnimationFrame(() => {
    topWatchFrame = 0;
    if (isProgrammaticScroll() || !canWriteHash() || !isAtTop()) return;
    clearHash();
  });
};

/** Point the top watcher at the sections' scroller (window when that is the document scroller). */
const watchScroller = () => {
  const anchor = [...sections.keys()].map((id) => document.getElementById(`${spyPrefix}${id}`)).find((element) => element !== null);
  const scroller = anchor ? findScrollParent(anchor) : null;
  const next: HTMLElement | Window = !scroller || isRootScroller(scroller) ? window : scroller;
  if (next === topWatchTarget) return;

  topWatchTarget?.removeEventListener('scroll', handleScroll);
  topWatchTarget = next;
  topWatchTarget.addEventListener('scroll', handleScroll, { passive: true });
};

const unwatchScroller = () => {
  topWatchTarget?.removeEventListener('scroll', handleScroll);
  topWatchTarget = null;
  cancelAnimationFrame(topWatchFrame);
  topWatchFrame = 0;
};

let reevaluateTimer = 0;

const blockHashWrites = (ms: number) => {
  hashWriteBlockedUntil = Date.now() + ms;

  // Re-evaluate once the block expires so the spy isn't stuck if no new IO fires
  clearTimeout(reevaluateTimer);
  reevaluateTimer = window.setTimeout(() => {
    const best = getBestSection();
    if (best && best !== currentSection) {
      currentSection = best;
      markActiveLinks();
      notify();
    }
  }, ms + 50);
};

/** Picks the pinned section while in view, else the topmost one at the top, else the last anchor past a trigger line near the top. Null while none is in view. */
const getBestSection = (): string | null => {
  const visible = [...sections.entries()].filter(([, ratio]) => ratio > 0);
  if (!visible.length) return null;
  if (pinnedSection && visible.some(([id]) => id === pinnedSection)) return pinnedSection;

  const triggerY = window.innerHeight * 0.25;

  // Every rendered anchor counts, not only those in view: after a long scroll the current section's anchor sits above the viewport
  const withPositions = [...sections.keys()]
    .flatMap((id) => {
      const element = document.getElementById(`${spyPrefix}${id}`);
      return element?.getClientRects().length ? [{ id, top: element.getBoundingClientRect().top }] : [];
    })
    .sort((a, b) => a.top - b.top);

  // Nothing is scrolled to yet, even when a short intro puts later anchors past the trigger
  if (isAtTop()) return withPositions[0].id;

  const pastTrigger = withPositions.filter(({ top }) => top <= triggerY);
  if (pastTrigger.length) return pastTrigger[pastTrigger.length - 1].id;

  return withPositions[0].id;
};

const rebuild = () => {
  observer?.disconnect();
  if (!sections.size) {
    observer = null;
    unwatchScroller();
    return;
  }

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        sections.set(entry.target.id.replace(spyPrefix, ''), entry.intersectionRatio);
      }

      // Skip section updates during programmatic scroll to prevent indicator jank
      if (isProgrammaticScroll()) return;

      const best = getBestSection();
      if (best && best !== currentSection) {
        currentSection = best;
        markActiveLinks();

        writeHash(best);

        // Notify subscribers only after scrolling settles.
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = window.setTimeout(notify, 150);
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );

  for (const id of sections.keys()) {
    const element = document.getElementById(`${spyPrefix}${id}`);
    if (element) observer.observe(element);
  }

  watchScroller();
};

export const registerSections = (ids: string[]) => {
  if (!initTime) initTime = Date.now();

  for (const id of ids) {
    if (!sections.has(id)) sections.set(id, 0);
  }
  rebuild();

  if (pendingScrollTarget && sections.has(pendingScrollTarget)) {
    savedSection = '';
    pendingFrameAttempts = 0;
    requestAnimationFrame(tryFlushPendingScroll);
    return;
  }

  // Re-registration (effect re-run): restore saved section without scrolling
  if (savedSection && sections.has(savedSection)) {
    currentSection = savedSection;
    savedSection = '';
    markActiveLinks();
    notify();
    return;
  }
  savedSection = '';

  // Allowed during the init window even when a child already set currentSection, so the parent's hash wins.
  const hash = location.hash.slice(1);
  const inInitWindow = Date.now() - initTime < 500;
  if (hash && sections.has(hash) && currentSection !== hash && (inInitWindow || !currentSection)) {
    currentSection = hash;
    pinnedSection = hash;
    markActiveLinks();
    notify();
    blockHashWrites(1000);
    requestAnimationFrame(() => {
      document.getElementById(`${spyPrefix}${hash}`)?.scrollIntoView({ behavior: 'instant' });
    });
    return;
  }

  if (!currentSection && ids.length) {
    currentSection = ids[0];
    markActiveLinks();
    notify();
  }
};

export const unregisterSections = (ids: string[]) => {
  for (const id of ids) sections.delete(id);

  if (!sections.size) {
    observer?.disconnect();
    observer = null;
    unwatchScroller();
    pinnedSection = '';
    savedSection = currentSection;
    if (currentSection !== '') {
      currentSection = '';
      markActiveLinks();
      notify();
    }
    initTime = 0;
  } else {
    rebuild();
  }
};

/** The document owns the scroller, so scroll events land on window. */
const isRootScroller = (element: HTMLElement) =>
  element === document.scrollingElement || element === document.documentElement || element === document.body;

/** Find the nearest scrollable ancestor (overflow-y auto/scroll with actual overflow), else the document scroller. */
const findScrollParent = (element: HTMLElement): HTMLElement => {
  let node = element.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
};

const performScroll = (element: HTMLElement, id: string) => {
  // Drive the overflow container directly; for the root scroller use 0 as reference (not rect.top).
  const scroller = findScrollParent(element);
  const scrollerTop = isRootScroller(scroller) ? 0 : scroller.getBoundingClientRect().top;
  const delta = element.getBoundingClientRect().top - scrollerTop;
  const targetTop = scroller.scrollTop + delta - 16;
  const smooth = Math.abs(delta) < window.innerHeight * 2;

  blockHashWrites(smooth ? 1200 : 500);
  pinnedSection = id;

  if (location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
  }

  // Re-assert scroll across two frames to win the race against TanStack Router's async scrollRestoration.
  const applyScroll = () => scroller.scrollTo({ top: targetTop, behavior: smooth ? 'smooth' : 'instant' });
  applyScroll();
  requestAnimationFrame(() => {
    applyScroll();
    requestAnimationFrame(applyScroll);
  });

  if (currentSection !== id) {
    currentSection = id;
    markActiveLinks();
    notify();
  }
};

/** True when the element has real layout, so a queued scroll can't land on a collapsed container. */
const isLaidOut = (element: HTMLElement): boolean => {
  if (typeof element.checkVisibility === 'function') {
    return element.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
  }
  if (element.offsetParent === null) return false;
  return element.getBoundingClientRect().height > 0;
};

const maxPendingFrames = 60; // ~1s at 60fps
let pendingFrameAttempts = 0;

/** Polls once per frame until the queued target is laid out, then scrolls. */
const tryFlushPendingScroll = () => {
  if (!pendingScrollTarget) return;

  const element = document.getElementById(`${spyPrefix}${pendingScrollTarget}`);
  if (element && isLaidOut(element)) {
    const id = pendingScrollTarget;
    pendingScrollTarget = null;
    pendingFrameAttempts = 0;
    performScroll(element, id);
    return;
  }

  if (pendingFrameAttempts++ < maxPendingFrames) {
    requestAnimationFrame(tryFlushPendingScroll);
  } else {
    pendingScrollTarget = null;
    pendingFrameAttempts = 0;
  }
};

/** Scroll to section and update hash. Queues hidden or missing targets until layout is ready. */
export const scrollToSectionById = (id: string) => {
  pendingScrollTarget = id;
  pendingFrameAttempts = 0;
  requestAnimationFrame(tryFlushPendingScroll);
};
