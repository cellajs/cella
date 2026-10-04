import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { type ComponentPropsWithoutRef, type ReactNode, type RefAttributes, useState } from 'react';
import { useCloseOnEscape } from '~/hooks/use-close-on-escape';
import { cn } from '~/utils/cn';

export function TooltipProvider({ delay = 200, timeout = 400, ...props }: { children: ReactNode; delay?: number; timeout?: number }) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} timeout={timeout} {...props} />;
}

/** Escape closes the tooltip from anywhere, also inside a sheet or dialog. A caller that controls `open` handles Escape itself. */
export function Tooltip({
  disableHoverablePopup,
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: Omit<TooltipPrimitive.Root.Props, 'children'> & { children?: ReactNode; disableHoverablePopup?: boolean }) {
  const [ownOpen, setOwnOpen] = useState(defaultOpen);
  const controlled = open !== undefined;
  const isOpen = controlled ? open : ownOpen;
  useCloseOnEscape(!controlled && isOpen, () => setOwnOpen(false));

  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      disableHoverablePopup={disableHoverablePopup}
      open={isOpen}
      onOpenChange={(nextOpen, eventDetails) => {
        setOwnOpen(nextOpen);
        onOpenChange?.(nextOpen, eventDetails);
      }}
      {...props}
    />
  );
}

export function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props & RefAttributes<HTMLElement>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 0,
  side,
  align,
  hideWhenDetached,
  container,
  children,
  ...props
}: {
  className?: string;
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  hideWhenDetached?: boolean;
  // `container` is part of @blocknote/shadcn's component contract: BlockNote portals tooltips into the element usePortalElement() returns
  container?: TooltipPrimitive.Portal.Props['container'];
  children?: ReactNode;
  hidden?: boolean;
} & Omit<ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="z-200">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-fit origin-(--transform-origin) text-balance rounded-md bg-muted-foreground px-3 py-1.5 text-primary-foreground text-xs data-closed:animate-out data-open:animate-in max-sm:hidden',
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

export function TooltipPortal({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
