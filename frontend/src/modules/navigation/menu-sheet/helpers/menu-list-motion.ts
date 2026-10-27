import { collapseMotion } from '~/modules/common/collapse-motion';

/**
 * `collapseMotion` for a menu list an archive or restore moves rows into: it clips only while it opens or closes, so a
 * row on its way in stays visible.
 */
export const menuListMotion = {
  ...collapseMotion,
  initial: { ...collapseMotion.initial, overflow: 'hidden' },
  animate: { ...collapseMotion.animate, transitionEnd: { overflow: 'visible' } },
  exit: { ...collapseMotion.exit, overflow: 'hidden' },
};

/** When a row an archive or restore moves has nearly landed: motion's default layout transition is 0.45 s and ends slowly. */
export const menuRowLandSeconds = 0.3;

/** How long a row archived into a closed menu list waits for it to open: its duration, plus the frames before it starts. */
export const menuListOpenMs = collapseMotion.transition.duration * 1000 + 50;
