import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import * as React from 'react';
import { cn } from '~/utils/cn';

export function HoverCard({
  children,
  ...props
}: {
  children?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <TooltipPrimitive.Provider delay={0}>
      <TooltipPrimitive.Root data-slot="hover-card" {...props}>
        {children}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}

export function HoverCardTrigger({ ...props }: TooltipPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <TooltipPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

export function HoverCardContent({
  className,
  align = 'center',
  sideOffset = 4,
  side = 'bottom',
  children,
  ...props
}: {
  className?: string;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  children?: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <TooltipPrimitive.Portal data-slot="hover-card-portal">
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="z-80">
        <TooltipPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            'bg-popover text-popover-foreground data-[open]:animate-in data-[closed]:animate-out data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-64 rounded-md border p-4 shadow-md outline-hidden',
            className,
          )}
          {...props}
        >
          {children}
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
