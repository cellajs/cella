/**
 * Enter and exit props for the icon buttons that appear beside a menu sheet section toggle once the section opens.
 * Width and margin lay out every frame, which stalls below sm while the nav drawer mounts, so there the button only
 * fades, as `collapseMotion` does for the blocks underneath it. The `ml-2` class carries the gap in that case.
 */
export function widenMotion(isMobile: boolean) {
  if (isMobile) return { initial: { opacity: 0 }, animate: { opacity: 1 } };

  const closed = { width: 0, marginLeft: 0, opacity: 0 };
  return { initial: closed, animate: { width: '2.5rem', marginLeft: '0.5rem', opacity: 1 }, exit: closed };
}
