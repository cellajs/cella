import { IndicatorBar } from '~/modules/common/spy-nav-item';

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
  /** When true, falls back to a CSS transform transition (no motion shared layout). */
  isMobile: boolean;
};

/** Assumes a `relative` parent, items stacked with no gap, and each item `h-8`. */
export function ActiveIndicator({ activeIndex, layoutId, isMobile }: ActiveIndicatorProps) {
  if (activeIndex < 0) return null;
  const top = LIST_PADDING_TOP_REM + INDICATOR_OFFSET_REM;
  const rowOffset = activeIndex * ITEM_HEIGHT_REM;
  const height = `${INDICATOR_HEIGHT_REM}rem`;
  // Mobile moves the bar by transform: that transition stays on the compositor, where a `top` transition relayouts every frame
  const style = isMobile ? { top: `${top}rem`, height, transform: `translateY(${rowOffset}rem)` } : { top: `${top + rowOffset}rem`, height };

  return (
    <IndicatorBar layoutId={layoutId} animate={!isMobile} className={isMobile ? 'transition-transform duration-200' : undefined} style={style} />
  );
}
