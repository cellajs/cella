import { IndicatorBar } from '~/modules/common/spy-nav-item';

// A CSS variable, so the bar follows the row height `sidebarLeafClass` sets for each screen; rem scales with the root font size
const rowHeightClass = '[--leaf-row:2rem] no-focus-ring:[--leaf-row:2.25rem]';
const height = '1rem';
// Centred on a row, below the list's `py-1`
const barTop = 'calc(0.25rem + (var(--leaf-row) - 1rem) / 2)';

interface ActiveIndicatorProps {
  /** Negative hides the bar. */
  activeIndex: number;
  /** Shared by sibling lists, so the bar animates between them. */
  layoutId: string;
  /** Moves by a CSS transform, without motion's shared layout. */
  isMobile: boolean;
}

/** Assumes a `relative` list with `py-1` whose rows are `sidebarLeafClass` and stack with no gap. */
export function ActiveIndicator({ activeIndex, layoutId, isMobile }: ActiveIndicatorProps) {
  if (activeIndex < 0) return null;
  const rowOffset = `${activeIndex} * var(--leaf-row)`;
  // A transform transition stays on the compositor, where a `top` transition relayouts every frame
  const style = isMobile ? { top: barTop, height, transform: `translateY(calc(${rowOffset}))` } : { top: `calc(${barTop} + ${rowOffset})`, height };

  return (
    <IndicatorBar
      layoutId={layoutId}
      animate={!isMobile}
      className={isMobile ? `${rowHeightClass} transition-transform duration-200` : rowHeightClass}
      style={style}
    />
  );
}
