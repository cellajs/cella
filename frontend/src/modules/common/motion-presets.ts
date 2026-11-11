/**
 * Enter, exit and timing props for motion/react components ([Motion](../../../README.md#ui-styling)). A component
 * spreads one of these or names its own transition as a constant in its file; a number never sits in JSX.
 */

/** A part that joins, leaves or is swapped by key: a fade on the shortest tier. */
export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.15 },
};

/** Two parts trading places (`AnimatePresence mode="wait"`): the fade with a short rise in and out. */
export const swapMotion = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.15 },
};

/**
 * A block that opens and closes by height. Height lays out every frame, so it is meant for a toggle: a block on
 * screen at first paint mounts without it (`initial={false}`).
 */
export const collapseMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};

/**
 * A pane that replaces another (`AnimatePresence mode="popLayout"`), such as a chooser giving way to the form it
 * picked: it grows in from 90% on a short spring, and a `MotionConfig` around the panes passes the transition on.
 */
export const scaleInMotion = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: 'spring', bounce: 0, duration: 0.4 } as const,
};
