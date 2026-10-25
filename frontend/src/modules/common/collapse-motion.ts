/**
 * Enter, exit and timing props for a block that opens and closes by height. Height lays out every frame, so it is
 * meant for a toggle: a block on screen at first paint mounts without it.
 */
export const collapseMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};
