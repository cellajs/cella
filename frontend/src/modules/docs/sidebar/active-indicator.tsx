import { motion } from 'motion/react';

// Use rem values for proper mobile scaling
const ITEM_HEIGHT_REM = 2; // 32px at base 16px
const LIST_PADDING_TOP_REM = 0.25; // 4px at base 16px
const INDICATOR_OFFSET_REM = 0.5; // 8px at base 16px
const INDICATOR_HEIGHT_REM = 1; // 16px (ITEM_HEIGHT - 16)

type ActiveIndicatorProps = {
  /** Index of the active row in the list. Pass -1 (or any negative) to hide. */
  activeIndex: number;
  /** Unique id for the motion layout animation between sibling lists. */
  layoutId: string;
  /** When true, falls back to a CSS transition (no motion shared layout). */
  isMobile: boolean;
};

/**
 * Vertical highlight bar that animates to the active row in a tightly stacked list.
 * Assumes parent is `relative`, items are stacked with no gap, and each item is `h-8`.
 */
export function ActiveIndicator({ activeIndex, layoutId, isMobile }: ActiveIndicatorProps) {
  if (activeIndex < 0) return null;
  const style = {
    top: `${LIST_PADDING_TOP_REM + activeIndex * ITEM_HEIGHT_REM + INDICATOR_OFFSET_REM}rem`,
    height: `${INDICATOR_HEIGHT_REM}rem`,
  };

  if (isMobile) {
    return (
      <span
        className="absolute left-2 ml-px w-[0.20rem] rounded-full bg-primary transition-[top] duration-200"
        style={style}
      />
    );
  }
  return (
    <motion.span
      layoutId={layoutId}
      transition={{ type: 'spring', stiffness: 300, damping: 30, mass: 0.8 }}
      className="absolute left-2 ml-px w-[0.20rem] rounded-full bg-primary"
      style={style}
    />
  );
}
