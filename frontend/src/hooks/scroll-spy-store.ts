/**
 * Shared scroll spy store - module-level singleton state.
 * Manages section contributions, IntersectionObserver, and current section tracking.
 */

type NavigateFn = (opts: {
  to: string;
  search: (prev: Record<string, unknown>) => Record<string, unknown>;
  hash: string;
  replace: boolean;
  hashScrollIntoView?: boolean | { behavior: ScrollBehavior };
}) => void;

// ─── State ─────────────────────────────────────────────────────────────────────

/** Map of componentId → sectionIds owned by that component */
const sectionContributors = new Map<string, string[]>();

/** Map of sectionId → intersection ratio */
const sectionRatios = new Map<string, number>();

/** Currently active section ID */
let currentSection = '';

/** Shared IntersectionObserver instance */
let observer: IntersectionObserver | null = null;

/** Flag to prevent hash writes during programmatic scrolls */
let isProgrammaticScroll = false;

/** Flag to track if initial hash scroll has been handled */
let hasScrolledToInitialHash = false;

/** Whether URL had a hash when store was first activated */
let hadInitialHash = false;

/** Timestamp when first section was registered (for delayed hash writing) */
let firstRegistrationTime = 0;

/** Delay before auto-writing hash (ms) - prevents hash on initial page load */
const HASH_WRITE_DELAY = 300;

/** Subscribers for state changes */
const listeners = new Set<() => void>();

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Get all unique section IDs across all contributors */
const getAllSectionIds = (): string[] => {
  const all = [...sectionContributors.values()].flat();
  return [...new Set(all)];
};

/** Notify all subscribers of state change */
const notifyListeners = () => {
  for (const listener of listeners) {
    listener();
  }
};

/** Determine best section based on intersection ratios */
const determineBestSection = (): string | null => {
  const entries = [...sectionRatios.entries()].filter(([, ratio]) => ratio > 0);
  if (entries.length === 0) return null;

  // Find fully visible sections (ratio === 1)
  const fullyVisible = entries.filter(([, ratio]) => ratio === 1);

  if (fullyVisible.length > 0) {
    // Pick the one closest to top of viewport
    const sorted = fullyVisible
      .map(([id, ratio]) => {
        const el = document.getElementById(id);
        return { id, ratio, top: el?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY };
      })
      .sort((a, b) => a.top - b.top);
    return sorted[0].id;
  }

  // Otherwise pick highest ratio
  const [bestId] = entries.reduce((best, curr) => (curr[1] > best[1] ? curr : best));
  return bestId;
};

// ─── Observer ──────────────────────────────────────────────────────────────────

/** Set up the shared IntersectionObserver */
const setupObserver = () => {
  if (observer) {
    observer.disconnect();
  }

  const sectionIds = getAllSectionIds();
  if (sectionIds.length === 0) {
    observer = null;
    return;
  }

  // Initialize ratios for all sections
  sectionRatios.clear();
  for (const id of sectionIds) {
    sectionRatios.set(id, 0);
  }

  observer = new IntersectionObserver(
    (entries) => {
      // Update ratios
      for (const entry of entries) {
        sectionRatios.set(entry.target.id, entry.intersectionRatio);
      }

      // Determine and set best section
      const best = determineBestSection();
      if (best && best !== currentSection) {
        currentSection = best;
        notifyListeners();
      }
    },
    {
      root: null,
      rootMargin: '0px',
      threshold: [0, 1],
    },
  );

  // Observe existing elements
  for (const id of sectionIds) {
    const element = document.getElementById(id);
    if (element) observer.observe(element);
  }
};

// ─── Public API ────────────────────────────────────────────────────────────────

/** Subscribe to state changes (for useSyncExternalStore) */
export const subscribe = (callback: () => void) => {
  listeners.add(callback);
  return () => listeners.delete(callback);
};

/** Get current section snapshot (for useSyncExternalStore) */
export const getSnapshot = () => currentSection;

/** Server snapshot (for SSR) */
export const getServerSnapshot = () => '';

/** Check if we're in a programmatic scroll */
export const isInProgrammaticScroll = () => isProgrammaticScroll;

/** Check if hash writing is allowed (had initial hash OR delay has passed) */
export const canWriteHash = () => {
  if (hadInitialHash) return true;
  if (firstRegistrationTime === 0) return false;
  return Date.now() - firstRegistrationTime >= HASH_WRITE_DELAY;
};

/** Register sections from a contributor */
export const registerSections = (componentId: string, sectionIds: string[]) => {
  const existing = sectionContributors.get(componentId);
  const changed = !existing || existing.length !== sectionIds.length || existing.some((id, i) => id !== sectionIds[i]);

  if (!changed) return;

  // Track first registration time and initial hash state
  if (sectionContributors.size === 0) {
    firstRegistrationTime = Date.now();
    hadInitialHash = !!location.hash;
  }

  sectionContributors.set(componentId, sectionIds);

  // Set initial section from hash if valid and not yet set
  if (!currentSection) {
    const hash = location.hash.replace('#', '');
    const allIds = getAllSectionIds();
    if (hash && allIds.includes(hash)) {
      currentSection = hash;
    }
  }

  setupObserver();

  // Handle initial hash scroll (once)
  if (!hasScrolledToInitialHash) {
    const hash = location.hash.replace('#', '');
    if (hash && sectionIds.includes(hash)) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const element = document.getElementById(hash);
          if (element) {
            element.scrollIntoView({ behavior: 'instant' });
            hasScrolledToInitialHash = true;
          }
        });
      });
    }
  }
};

/** Unregister sections when a contributor unmounts */
export const unregisterSections = (componentId: string) => {
  if (!sectionContributors.has(componentId)) return;

  sectionContributors.delete(componentId);

  if (sectionContributors.size === 0) {
    // Reset all state
    currentSection = '';
    sectionRatios.clear();
    hasScrolledToInitialHash = false;
    hadInitialHash = false;
    firstRegistrationTime = 0;
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    notifyListeners();
  } else {
    setupObserver();
  }
};

/** Scroll to a section and update hash */
export const scrollToSection = (id: string, smoothScroll: boolean, navigate: NavigateFn) => {
  isProgrammaticScroll = true;

  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'instant' });
  }

  // Reset hash first if same (forces TanStack Router to handle it)
  if (window.location.hash === `#${id}`) {
    navigate({ to: '.', search: (prev) => prev, hash: 'top', replace: true });
  }

  setTimeout(() => {
    navigate({
      to: '.',
      search: (prev) => prev,
      hash: id,
      replace: true,
      hashScrollIntoView: false,
    });
  }, 20);

  // Re-enable observer-based hash writes after scroll completes
  setTimeout(
    () => {
      isProgrammaticScroll = false;
    },
    smoothScroll ? 4000 : 2000,
  );
};

/**
 * Scroll to a section by ID - standalone function for use without the hook.
 * Updates URL hash and scrolls element into view.
 */
export const scrollToSectionById = (id: string, smoothScroll = false) => {
  isProgrammaticScroll = true;

  const element = document.getElementById(id);
  if (element) {
    element.scrollIntoView({ behavior: smoothScroll ? 'smooth' : 'instant' });
  }

  // Update URL hash directly
  if (window.location.hash !== `#${id}`) {
    history.replaceState(null, '', `#${id}`);
  }

  // Re-enable observer-based hash writes after scroll completes
  setTimeout(
    () => {
      isProgrammaticScroll = false;
    },
    smoothScroll ? 4000 : 2000,
  );
};
