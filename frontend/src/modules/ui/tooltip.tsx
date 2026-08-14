import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import type { ComponentPropsWithoutRef, ReactNode, RefAttributes } from 'react';
import { cn } from '~/utils/cn';

/** Renders the styled tooltip provider primitive. */
export function TooltipProvider({
  delay = 200,
  timeout = 400,
  ...props
}: {
  children: ReactNode;
  delay?: number;
  timeout?: number;
}) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} timeout={timeout} {...props} />;
}

/** Renders the styled tooltip primitive. */
export function Tooltip({
  disableHoverablePopup,
  ...props
}: Omit<TooltipPrimitive.Root.Props, 'children'> & {
  children?: ReactNode;
  disableHoverablePopup?: boolean;
}) {
  return <TooltipPrimitive.Root data-slot="tooltip" disableHoverablePopup={disableHoverablePopup} {...props} />;
}

/** Renders the styled tooltip trigger primitive. */
export function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props & RefAttributes<HTMLElement>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

/** Renders the styled tooltip content primitive. */
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
  // `container` is part of @blocknote/shadcn's component contract: BlockNote portals tooltips into editor.portalElement
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
            'fade-in-0 zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-fit animate-in text-balance rounded-md bg-muted-foreground px-3 py-1.5 text-primary-foreground text-xs data-closed:animate-out max-sm:hidden',
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

// Keep TooltipPortal as a pass-through for backward compatibility
/** Renders the styled tooltip portal primitive. */
export function TooltipPortal({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
