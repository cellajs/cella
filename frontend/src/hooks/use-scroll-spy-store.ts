/** DOM id prefix (e.g. id="spy-intro") prevents browser auto-scroll on hash change */
const SPY_PREFIX = 'spy-';

const sections = new Map<string, number>(); // sectionId → intersection ratio
let observer: IntersectionObserver | null = null;
let currentSection = '';
let hashWriteBlockedUntil = 0;
let initTime = 0;
let pendingScrollTarget: string | null = null;
let scrollSettleTimer = 0;
let savedSection = ''; // Preserved across quick re-registrations (effect re-runs)

// Subscribers for useSyncExternalStore
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

/** Toggles data-spy-active on matching data-spy-link elements, bypassing React to keep scrolling smooth. */
const syncActiveDOM = () => {
  for (const el of document.querySelectorAll('[data-spy-active]')) {
    delete (el as HTMLElement).dataset.spyActive;
  }
  if (currentSection) {
    for (const el of document.querySelectorAll(`[data-spy-link="${CSS.escape(currentSection)}"]`)) {
      (el as HTMLElement).dataset.spyActive = '';
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

/** Within this many px of the top, no section counts as anchored. */
const TOP_THRESHOLD = 64;

let topWatchTarget: HTMLElement | Window | null = null;
let topWatchFrame = 0;

const scrollTopOf = (target: HTMLElement | Window) =>
  target === window ? window.scrollY : (target as HTMLElement).scrollTop;

const isAtTop = () => scrollTopOf(topWatchTarget ?? window) <= TOP_THRESHOLD;

/** Drop the hash, keeping path and search intact. */
const clearHash = () => {
  if (!location.hash) return;
  history.replaceState(null, '', location.pathname + location.search);
};

/** Near the top the hash is dropped so a reload returns to the top; `currentSection` stays set for the TOC. */
const syncHash = (id: string) => {
  if (!canWriteHash()) return;
  if (isAtTop()) clearHash();
  else if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
};

/** The observer misses the final stretch back to the top, so watch scroll directly; this only clears the hash. */
const onScrollNearTop = () => {
  if (topWatchFrame) return;
  topWatchFrame = requestAnimationFrame(() => {
    topWatchFrame = 0;
    if (isProgrammaticScroll() || !canWriteHash() || !isAtTop()) return;
    clearHash();
  });
};

/** Point the top watcher at the sections' scroller (window when that is the document scroller). */
const watchScroller = () => {
  const anchor = [...sections.keys()]
    .map((id) => document.getElementById(`${SPY_PREFIX}${id}`))
    .find((el): el is HTMLElement => el !== null);
  const scroller = anchor ? findScrollParent(anchor) : null;
  const next: HTMLElement | Window = !scroller || isRootScroller(scroller) ? window : scroller;
  if (next === topWatchTarget) return;

  topWatchTarget?.removeEventListener('scroll', onScrollNearTop);
  topWatchTarget = next;
  topWatchTarget.addEventListener('scroll', onScrollNearTop, { passive: true });
};

const unwatchScroller = () => {
  topWatchTarget?.removeEventListener('scroll', onScrollNearTop);
  topWatchTarget = null;
  cancelAnimationFrame(topWatchFrame);
  topWatchFrame = 0;
};

let blockReEvalTimer = 0;

const blockHashWrites = (ms: number) => {
  hashWriteBlockedUntil = Date.now() + ms;

  // Re-evaluate once the block expires so the spy isn't stuck if no new IO fires
  clearTimeout(blockReEvalTimer);
  blockReEvalTimer = window.setTimeout(() => {
    const best = getBestSection();
    if (best && best !== currentSection) {
      currentSection = best;
      syncActiveDOM();
      notify();
    }
  }, ms + 50);
};

/** Picks the last anchor to have crossed a trigger line near the top of the viewport. */
const getBestSection = (): string | null => {
  const visible = [...sections.entries()].filter(([, r]) => r > 0);
  if (!visible.length) return null;

  const triggerY = window.innerHeight * 0.25;

  const withPositions = visible
    .map(([id]) => ({
      id,
      top: document.getElementById(`${SPY_PREFIX}${id}`)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.top - b.top);

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
      for (const e of entries) {
        sections.set(e.target.id.replace(SPY_PREFIX, ''), e.intersectionRatio);
      }

      // Skip section updates during programmatic scroll to prevent indicator jank
      if (isProgrammaticScroll()) return;

      const best = getBestSection();
      if (best && best !== currentSection) {
        currentSection = best;
        syncActiveDOM();

        syncHash(best);

        // Notify subscribers only after scrolling settles.
        clearTimeout(scrollSettleTimer);
        scrollSettleTimer = window.setTimeout(notify, 150);
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  );

  for (const id of sections.keys()) {
    const el = document.getElementById(`${SPY_PREFIX}${id}`);
    if (el) observer.observe(el);
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
    syncActiveDOM();
    notify();
    return;
  }
  savedSection = '';

  // Allowed during the init window even when a child already set currentSection, so the parent's hash wins.
  const hash = location.hash.slice(1);
  const inInitWindow = Date.now() - initTime < 500;
  if (hash && sections.has(hash) && currentSection !== hash && (inInitWindow || !currentSection)) {
    currentSection = hash;
    syncActiveDOM();
    notify();
    blockHashWrites(1000);
    requestAnimationFrame(() => {
      document.getElementById(`${SPY_PREFIX}${hash}`)?.scrollIntoView({ behavior: 'instant' });
    });
    return;
  }

  if (!currentSection && ids.length) {
    currentSection = ids[0];
    syncActiveDOM();
    notify();
  }
};

export const unregisterSections = (ids: string[]) => {
  for (const id of ids) sections.delete(id);

  if (!sections.size) {
    observer?.disconnect();
    observer = null;
    unwatchScroller();
    savedSection = currentSection;
    if (currentSection !== '') {
      currentSection = '';
      syncActiveDOM();
      notify();
    }
    initTime = 0;
  } else {
    rebuild();
  }
};

/** The document owns the scroller, so scroll events land on window. */
const isRootScroller = (el: HTMLElement) =>
  el === document.scrollingElement || el === document.documentElement || el === document.body;

/** Find the nearest scrollable ancestor (overflow-y auto/scroll with actual overflow), else the document scroller. */
const findScrollParent = (el: HTMLElement): HTMLElement => {
  let node = el.parentElement;
  while (node) {
    const cs = getComputedStyle(node);
    if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight + 1) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement;
};

const performScroll = (el: HTMLElement, id: string) => {
  // Drive the overflow container directly; for the root scroller use 0 as reference (not rect.top).
  const scroller = findScrollParent(el);
  const scrollerTop = isRootScroller(scroller) ? 0 : scroller.getBoundingClientRect().top;
  const delta = el.getBoundingClientRect().top - scrollerTop;
  const targetTop = scroller.scrollTop + delta - 16;
  const smooth = Math.abs(delta) < window.innerHeight * 2;

  blockHashWrites(smooth ? 1200 : 500);

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
    syncActiveDOM();
    notify();
  }
};

/** True when the element has real layout, so a queued scroll can't land on a collapsed container. */
const isLaidOut = (el: HTMLElement): boolean => {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
  }
  if (el.offsetParent === null) return false;
  return el.getBoundingClientRect().height > 0;
};

const MAX_PENDING_FRAMES = 60; // ~1s at 60fps
let pendingFrameAttempts = 0;

/** Polls once per frame until the queued target is laid out, then scrolls. */
const tryFlushPendingScroll = () => {
  if (!pendingScrollTarget) return;

  const el = document.getElementById(`${SPY_PREFIX}${pendingScrollTarget}`);
  if (el && isLaidOut(el)) {
    const id = pendingScrollTarget;
    pendingScrollTarget = null;
    pendingFrameAttempts = 0;
    performScroll(el, id);
    return;
  }

  if (pendingFrameAttempts++ < MAX_PENDING_FRAMES) {
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
