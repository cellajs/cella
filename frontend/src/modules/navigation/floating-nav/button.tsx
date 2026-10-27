import { type ReactNode, type Ref, type TouchEvent, useRef } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const tapSlopPx = 12; // Max finger travel for a touchend to still count as a tap

export interface FloatingNavItem {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel: string;
  /** Defaults to true. */
  visible?: boolean;
  /** Defaults to 'right'. */
  direction?: 'left' | 'right';
  /** Text shown after the icon while `labelVisible`, expanding the circle into a pill (e.g. a first-visit hint). */
  label?: string;
  labelVisible?: boolean;
}

interface FloatingNavButtonProps extends Omit<FloatingNavItem, 'visible' | 'ariaLabel'> {
  /** Required on a nav item; an inert placeholder button may go without. */
  ariaLabel?: string;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
  /** Marks on the button, such as a `Badge context="button"`. */
  children?: ReactNode;
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
  ref,
  children,
}: FloatingNavButtonProps) {
  // A tap that interrupts a momentum scroll cancels the fling, and the browser suppresses its click,
  // so touch taps run on touchend. preventDefault there stops the synthesized click entirely, since
  // it would otherwise hit-test against whatever onClick just mounted (e.g. a drawer overlay) and
  // dismiss it. Touchcancel (scroll takeover) and the slop check keep drags from triggering.
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    const touch = event.touches.length === 1 ? event.touches[0] : null;
    touchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTouchCancel = () => {
    touchStartRef.current = null;
  };

  const handleTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    if (Math.hypot(touch.clientX - start.x, touch.clientY - start.y) > tapSlopPx) return;
    // Not cancelable means the browser consumed the gesture as a scroll and suppresses the click itself
    if (event.cancelable) event.preventDefault();
    onClick();
  };

  return (
    <Button
      ref={ref}
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      press={false}
      onClick={onClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className={cn(
        'fixed bottom-[calc(1rem+var(--bottom-inset,0px))] z-105 select-none rounded-full transition-[translate,scale,opacity] duration-300 ease-in-out [-webkit-touch-callout:none] hover:bg-secondary active:scale-95 data-[direction=right]:right-4 data-[direction=left]:left-4',
        // A translucent ring sets the button off from whatever scrolls under it, a grey card of its own fill included
        'shadow-floating',
        // With a label the width is content-driven: the icon keeps its centered-in-circle offset via pl-4, the pill grows to the right
        label ? 'h-14 w-auto min-w-14 justify-start gap-0 pl-4' : 'size-14',
        // Hiding moves by translate, which skips layout
        'chrome-hidden:pointer-events-none chrome-hidden:translate-y-16 chrome-hidden:scale-50 chrome-hidden:opacity-0',
        className,
      )}
      aria-label={ariaLabel}
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
      {children}
    </Button>
  );
}
