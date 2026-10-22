/**
 * Enter, exit and timing props for the icon buttons that appear beside a menu sheet section toggle once the section
 * opens. Like `collapseMotion`, they run on a toggle only, so width and margin lay out on every screen size.
 */
const closed = { width: 0, marginLeft: 0, opacity: 0 };

export const widenMotion = {
  initial: closed,
  animate: { width: '2.5rem', marginLeft: '0.5rem', opacity: 1 },
  exit: closed,
  transition: { bounce: 0, duration: 0.2 },
};
