/**
 * Enter and exit props for a collapsible menu sheet block. A height animation lays out every frame and stalls
 * while the mobile nav drawer mounts, so below sm the block fades in and closes instantly: a fade-out would hold
 * its space and then let the content below jump.
 */
export function collapseMotion(isMobile: boolean) {
  return isMobile
    ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
    : { initial: { height: 0, opacity: 0 }, animate: { height: 'auto', opacity: 1 }, exit: { height: 0, opacity: 0 } };
}
