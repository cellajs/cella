/**
 * Enter, exit and timing props for a collapsible menu sheet block, on every screen size. Height lays out every frame,
 * but a toggle runs while the sheet stands still (each AnimatePresence is `initial={false}`, so the sheet's mount
 * animates nothing), and the content below moves along with the block while it mounts or unmounts.
 */
export const collapseMotion = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.2, ease: 'easeInOut' as const },
};
