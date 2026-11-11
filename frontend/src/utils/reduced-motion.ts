/** Whether the person asked the system for less motion. Read at the moment of use: the setting changes at runtime. */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The `behavior` of a scroll the app starts on its own: `smooth`, or `instant` under reduced motion. */
export const scrollBehavior = (): ScrollBehavior => (prefersReducedMotion() ? 'instant' : 'smooth');
