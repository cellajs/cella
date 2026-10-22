import { IndicatorBar } from '~/modules/common/spy-nav-item';

// In rem, so the bar scales with the root font size: it sits centred on an `h-8` row, below the list's `py-1`
const rowHeightRem = 2;
const barHeightRem = 1;
const barTopRem = 0.25 + (rowHeightRem - barHeightRem) / 2;

interface ActiveIndicatorProps {
  /** Index of the active row in the list. Pass -1 (or any negative) to hide. */
  activeIndex: number;
  /** Unique id for the motion layout animation between sibling lists. */
  layoutId: string;
  /** Below `md`, where the sidebar is a sheet: the bar moves by a CSS transform, without motion's shared layout. */
  isMobile: boolean;
}

/** Assumes a `relative` list with `py-1` whose rows are `h-8` and stack with no gap. */
export function ActiveIndicator({ activeIndex, layoutId, isMobile }: ActiveIndicatorProps) {
  if (activeIndex < 0) return null;
  const rowOffset = activeIndex * rowHeightRem;
  const height = `${barHeightRem}rem`;
  // A transform transition stays on the compositor, where a `top` transition relayouts every frame
  const style = isMobile
    ? { top: `${barTopRem}rem`, height, transform: `translateY(${rowOffset}rem)` }
    : { top: `${barTopRem + rowOffset}rem`, height };

  return (
    <IndicatorBar layoutId={layoutId} animate={!isMobile} className={isMobile ? 'transition-transform duration-200' : undefined} style={style} />
  );
}
