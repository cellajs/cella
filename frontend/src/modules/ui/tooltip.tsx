import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { type ComponentPropsWithoutRef, type ReactNode, type RefAttributes } from 'react';
import { cn } from '~/utils/cn';

export function TooltipProvider({
  delayDuration,
  skipDelayDuration,
  disableHoverableContent: _disableHoverableContent,
  ...props
}: {
  children: ReactNode;
  delayDuration?: number;
  skipDelayDuration?: number;
  disableHoverableContent?: boolean;
}) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delayDuration ?? 200}
      timeout={skipDelayDuration ?? 400}
      {...props}
    />
  );
}

export function Tooltip({
  disableHoverablePopup,
  ...props
}: Omit<TooltipPrimitive.Root.Props, 'children'> & {
  children?: ReactNode;
  disableHoverablePopup?: boolean;
}) {
  return <TooltipPrimitive.Root data-slot="tooltip" disableHoverablePopup={disableHoverablePopup} {...props} />;
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
  children,
  ...props
}: {
  className?: string;
  sideOffset?: number;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  hideWhenDetached?: boolean;
  children?: ReactNode;
  hidden?: boolean;
} & Omit<ComponentPropsWithoutRef<'div'>, 'className'>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner side={side} sideOffset={sideOffset} align={align} className="z-200">
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'max-sm:hidden bg-muted-foreground text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-fit rounded-md px-3 py-1.5 text-xs text-balance',
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
export function TooltipPortal({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
