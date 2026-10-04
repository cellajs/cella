import { type TouchEvent, useRef } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const TAP_SLOP_PX = 12; // Max finger travel for a touchend to still count as a tap

export interface FloatingNavItem {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  /** Defaults to true. */
  visible?: boolean;
  /** Defaults to 'right'; with several items the first visible one defaults to 'left'. */
  direction?: 'left' | 'right';
  /** Text shown after the icon while `labelVisible`, expanding the circle into a pill (e.g. a first-visit hint). */
  label?: string;
  labelVisible?: boolean;
}

interface FloatingNavButtonProps {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  direction?: 'left' | 'right';
  label?: string;
  labelVisible?: boolean;
}

export function FloatingNavButton({
  id,
  icon: Icon,
  onClick,
  ariaLabel,
  className,
  direction = 'right',
  label,
  labelVisible,
}: FloatingNavButtonProps) {
  // A tap that interrupts a momentum scroll cancels the fling, and the browser suppresses its click,
  // so touch taps run on touchend. preventDefault there stops the synthesized click entirely, since
  // it would otherwise hit-test against whatever onClick just mounted (e.g. a drawer overlay) and
  // dismiss it. Touchcancel (scroll takeover) and the slop check keep drags from triggering.
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchCancel = () => {
    touchStart.current = null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > TAP_SLOP_PX) return;
    // Not cancelable means the browser consumed the gesture as a scroll and suppresses the click itself
    if (event.cancelable) event.preventDefault();
    onClick();
  };

  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={cn(
        'fixed bottom-[calc(1rem+var(--bottom-inset,0px))] z-105 flex items-center rounded-full bg-secondary opacity-100 shadow-xl transition-[translate,scale,opacity] duration-300 ease-in-out hover:bg-secondary active:scale-95 data-[direction=right]:right-4 data-[direction=left]:left-4',
        // With a label the width is content-driven: the icon keeps its centered-in-circle offset via pl-4, the pill grows to the right
        label ? 'h-14 w-auto min-w-14 justify-start gap-0 pl-4' : 'size-14 justify-center',
        // Animate out while the floating selection action bar is shown; hiding moves by translate, which skips layout
        'group-[.selection-active]/body:pointer-events-none group-[.selection-active]/body:translate-y-16 group-[.selection-active]/body:scale-50 group-[.selection-active]/body:opacity-0',
        className,
      )}
      aria-label={ariaLabel ?? 'Navigate'}
    >
      <Icon className="size-6" />
      {label && (
        // 0fr -> 1fr animates the pill width without measuring the text; the inner span carries the collapsible padding
        <span
          className={cn(
            'grid grid-cols-[0fr] transition-[grid-template-columns] duration-300 ease-in-out motion-reduce:transition-none',
            labelVisible && 'grid-cols-[1fr] delay-150',
          )}
        >
          <span className="overflow-hidden">
            <span
              className={cn(
                'block -translate-x-2 pr-4 pl-2 font-semibold text-xs uppercase tracking-widest opacity-0 transition-[opacity,translate] duration-300 ease-in-out motion-reduce:transition-none',
                labelVisible && 'translate-x-0 opacity-100 delay-150',
              )}
            >
              {label}
            </span>
          </span>
        </span>
      )}
    </Button>
  );
}
