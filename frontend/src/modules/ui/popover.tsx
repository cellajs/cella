import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = 4,
  side,
  alignOffset,
  finalFocus,
  children,
  ...props
}: {
  className?: string;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  alignOffset?: number;
  finalFocus?: PopoverPrimitive.Popup.Props['finalFocus'];
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="z-200"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          finalFocus={finalFocus}
          className={cn(
            'bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-72 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden',
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

export function PopoverContentNoPortal({
  className,
  align = 'center',
  sideOffset = 4,
  side,
  alignOffset,
  children,
  ...props
}: {
  className?: string;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  alignOffset?: number;
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <PopoverPrimitive.Positioner
      side={side}
      sideOffset={sideOffset}
      align={align}
      alignOffset={alignOffset}
      className="z-200"
    >
      <PopoverPrimitive.Popup
        data-slot="popover-content"
        className={cn(
          'bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-72 origin-(--transform-origin) rounded-md border p-4 shadow-md outline-hidden',
          className,
        )}
        {...props}
      >
        {children}
      </PopoverPrimitive.Popup>
    </PopoverPrimitive.Positioner>
  );
}

export function PopoverAnchor({ ...props }: PopoverPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <PopoverPrimitive.Trigger data-slot="popover-anchor" {...props} />;
}

export function PopoverHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="popover-header" className={cn('flex flex-col gap-1 text-sm', className)} {...props} />;
}

export function PopoverTitle({ className, ...props }: React.ComponentProps<'h2'>) {
  return <div data-slot="popover-title" className={cn('font-medium', className)} {...props} />;
}

export function PopoverDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="popover-description" className={cn('text-muted-foreground', className)} {...props} />;
}
