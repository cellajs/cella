/** DOM id prefix (e.g. id="spy-intro") prevents browser auto-scroll on hash change */
const SPY_PREFIX = 'spy-';

// State
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

/**
 * Toggle data-spy-active on DOM elements with matching data-spy-link.
 * Called from IO callback, bypasses React for jank-free scroll updates.
 */
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

/** Subscribe to currentSection changes (useSyncExternalStore contract). */
export const subscribeSection = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Get current section snapshot (useSyncExternalStore contract). */
export const getSection = () => currentSection;

/** Check if hash writes are currently allowed */
const canWriteHash = () => Date.now() > hashWriteBlockedUntil && initTime && Date.now() - initTime > 300;

/** Check if a programmatic scroll is currently in progress */
export const isProgrammaticScroll = () => Date.now() < hashWriteBlockedUntil;

let blockReEvalTimer = 0;

/** Block hash writes for a duration, then re-evaluate best section */
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

/** Find the best visible section using a "pin to top" approach.
 *  Picks the last anchor to have crossed a trigger line near the top of the viewport. */
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

  // Among anchors that have scrolled past the trigger line, pick the most recent (largest top ≤ trigger)
  const pastTrigger = withPositions.filter(({ top }) => top <= triggerY);
  if (pastTrigger.length) return pastTrigger[pastTrigger.length - 1].id;

  // No anchor past trigger yet, pick the closest one approaching it.
  return withPositions[0].id;
};

/** Rebuild observer for current sections */
const rebuild = () => {
  observer?.disconnect();
  if (!sections.size) {
    observer = null;
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

        // Write hash (skip during initial load delay)
        if (canWriteHash() && location.hash !== `#${best}`) {
          history.replaceState(null, '', `#${best}`);
        }

        // Notify React subscribers after scroll settles (no re-render during active scroll)
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
};

/** Register section IDs for observation */
export const registerSections = (ids: string[]) => {
  if (!initTime) initTime = Date.now();

  for (const id of ids) {
    if (!sections.has(id)) sections.set(id, 0);
  }
  rebuild();

  // Resolve pending scroll target if it was just registered
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

  // Scroll to initial hash if present.
  // Allow during init window even if a child set currentSection first. This prevents early
  // registration from overriding the parent's hash-matched section.
  const hash = location.hash.slice(1);
  const inInitWindow = Date.now() - initTime < 500;
  if (hash && sections.has(hash) && currentSection !== hash && (inInitWindow || !currentSection)) {
    currentSection = hash;
    syncActiveDOM();
    notify();
    blockHashWrites(1000); // Block writes during initial scroll
    requestAnimationFrame(() => {
      document.getElementById(`${SPY_PREFIX}${hash}`)?.scrollIntoView({ behavior: 'instant' });
    });
    return;
  }

  // Default to first section if nothing active yet
  if (!currentSection && ids.length) {
    currentSection = ids[0];
    syncActiveDOM();
    notify();
  }
};

/** Unregister section IDs */
export const unregisterSections = (ids: string[]) => {
  for (const id of ids) sections.delete(id);

  if (!sections.size) {
    observer?.disconnect();
    observer = null;
    savedSection = currentSection; // Preserve for potential re-registration
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

/** Scroll to element and update hash, reasserting across router scroll restoration. */
const performScroll = (el: HTMLElement, id: string) => {
  // Drive the overflow container directly; for the root scroller use 0 as reference (not rect.top).
  const scroller = findScrollParent(el);
  const isRootScroller =
    scroller === document.scrollingElement || scroller === document.documentElement || scroller === document.body;
  const scrollerTop = isRootScroller ? 0 : scroller.getBoundingClientRect().top;
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

/** Element is in the DOM AND has real layout (not display:none, content-visibility:hidden, height:0).
 *  Prevents scrolling to a stale position when the target is mounted but inside a collapsed/prerendered
 *  container that hasn't been laid out yet. */
const isLaidOut = (el: HTMLElement): boolean => {
  if (typeof el.checkVisibility === 'function') {
    return el.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true });
  }
  if (el.offsetParent === null) return false;
  return el.getBoundingClientRect().height > 0;
};

const MAX_PENDING_FRAMES = 60; // ~1s at 60fps
let pendingFrameAttempts = 0;

/** Poll once per frame until the queued target is laid out, then scroll. Bails after ~1s. */
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
