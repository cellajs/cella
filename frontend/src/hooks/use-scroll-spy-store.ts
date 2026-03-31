/**
 * Scroll spy store - tracks section visibility and updates URL hash.
 * DOM elements use 'spy-' prefix (e.g., id="spy-intro") to prevent browser auto-scroll.
 *
 * During scroll, visual updates are applied directly to the DOM via data-spy-active
 * attributes on elements with data-spy-link. React subscribers are notified only after
 * scrolling settles (150ms idle) or on explicit actions (clicks, initial hash).
 */

const SPY_PREFIX = 'spy-';

// State
const sections = new Map<string, number>(); // sectionId → intersection ratio
let observer: IntersectionObserver | null = null;
let currentSection = '';
let hashWriteBlockedUntil = 0;
let initTime = 0;
let pendingScrollTarget: string | null = null;
let scrollSettleTimer = 0;

// Subscribers for useSyncExternalStore
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

/**
 * Toggle data-spy-active on DOM elements with matching data-spy-link.
 * Called from IO callback — bypasses React for jank-free scroll updates.
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

/** Block hash writes for a duration */
const blockHashWrites = (ms: number) => {
  hashWriteBlockedUntil = Date.now() + ms;
};

/** Find the best visible section (highest ratio, or closest to top if tied) */
const getBestSection = (): string | null => {
  const visible = [...sections.entries()].filter(([, r]) => r > 0);
  if (!visible.length) return null;

  // If any fully visible, pick closest to top
  const full = visible.filter(([, r]) => r === 1);
  if (full.length) {
    return full
      .map(([id]) => ({
        id,
        top: document.getElementById(`${SPY_PREFIX}${id}`)?.getBoundingClientRect().top ?? Infinity,
      }))
      .sort((a, b) => a.top - b.top)[0].id;
  }

  // Otherwise highest ratio
  return visible.reduce((a, b) => (b[1] > a[1] ? b : a))[0];
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
    const target = pendingScrollTarget;
    pendingScrollTarget = null;
    requestAnimationFrame(() => {
      const el = document.getElementById(`${SPY_PREFIX}${target}`);
      if (el) performScroll(el, target);
    });
    return;
  }

  // Scroll to initial hash if present
  const hash = location.hash.slice(1);
  if (hash && sections.has(hash) && !currentSection) {
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

/** Scroll to element and update hash/state */
const performScroll = (el: HTMLElement, id: string) => {
  const distance = Math.abs(el.getBoundingClientRect().top);
  const smooth = distance < window.innerHeight * 2;

  blockHashWrites(smooth ? 3000 : 500);
  if (currentSection !== id) {
    currentSection = id;
    syncActiveDOM();
    notify();
  }

  if (location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
  }

  el.scrollIntoView({ behavior: smooth ? 'smooth' : 'instant' });
};

/** Scroll to section and update hash. Uses smooth scroll if target is within 2 viewport heights.
 *  If element not yet in DOM, queues the scroll — resolved when section registers via useScrollSpy. */
export const scrollToSectionById = (id: string) => {
  const el = document.getElementById(`${SPY_PREFIX}${id}`);
  if (!el) {
    // Element not in DOM yet — queue for when it registers
    pendingScrollTarget = id;
    return;
  }

  pendingScrollTarget = null;
  performScroll(el, id);
};
