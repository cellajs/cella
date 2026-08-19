import { type PointerEvent, useRef } from 'react';
import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const TAP_SLOP_PX = 12; // Max finger travel for a pointerup to still count as a tap

export interface FloatingNavItem {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  /** Defaults to true. */
  visible?: boolean;
  /** Defaults to 'right'; with several items the first visible one defaults to 'left'. */
  direction?: 'left' | 'right';
}

interface FloatingNavButtonProps {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  direction?: 'left' | 'right';
}

export function FloatingNavButton({
  id,
  icon: Icon,
  onClick,
  ariaLabel,
  className,
  direction = 'right',
}: FloatingNavButtonProps) {
  // A tap that interrupts a momentum scroll cancels the fling, and the browser suppresses its click,
  // so touch taps run on pointerup. Pointercancel (scroll takeover) and the slop check keep drags
  // from triggering; suppressClick avoids double-firing when a click does arrive.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    touchStart.current = event.pointerType === 'touch' ? { x: event.clientX, y: event.clientY } : null;
    suppressClick.current = false;
  };

  const handlePointerCancel = () => {
    touchStart.current = null;
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > TAP_SLOP_PX) return;
    suppressClick.current = true;
    onClick();
  };

  const handleClick = () => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    onClick();
  };

  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      className={cn(
        'fixed bottom-[calc(1rem+var(--bottom-inset,0px))] z-105 flex h-14 w-14 transform items-center justify-center rounded-full bg-secondary opacity-100 shadow-xl transition-all duration-300 ease-in-out hover:bg-secondary active:scale-95 data-[direction=right]:right-4 data-[direction=left]:left-4',
        // Animate out while the floating selection action bar is shown
        'group-[.selection-active]/body:pointer-events-none group-[.selection-active]/body:-bottom-12 group-[.selection-active]/body:scale-50 group-[.selection-active]/body:opacity-0',
        className,
      )}
      aria-label={ariaLabel ?? 'Navigate'}
    >
      <Icon className="icon-xl" />
    </Button>
  );
}
