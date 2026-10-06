import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import type { RefAttributes } from 'react';
import { cn } from '~/utils/cn';

export function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props & RefAttributes<HTMLElement>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  side,
  alignOffset,
  anchor,
  collisionPadding,
  finalFocus,
  container,
  positionerClassName,
  children,
  ...props
}: {
  className?: string;
  /** Classes for the positioner, which owns the stacking layer: put z-index overrides here. */
  positionerClassName?: string;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  alignOffset?: number;
  anchor?: Element | null | React.RefObject<Element | null>;
  collisionPadding?: number;
  finalFocus?: PopoverPrimitive.Popup.Props['finalFocus'];
  // `container` is part of @blocknote/shadcn's component contract: BlockNote portals popovers into the element usePortalElement() returns
  container?: PopoverPrimitive.Portal.Props['container'];
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <PopoverPrimitive.Portal container={container}>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        collisionPadding={collisionPadding}
        className={cn('z-200', positionerClassName)}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          finalFocus={finalFocus}
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-closed:animate-out data-open:animate-in',
            className,
          )}
          {...props}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
