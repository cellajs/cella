import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useCloseOnEscape } from '~/hooks/use-close-on-escape';
import type { PositionedContentProps } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

export function TooltipProvider({ delay = 200, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

/** Escape closes the tooltip from anywhere, also inside a sheet or dialog. */
export function Tooltip({ open, defaultOpen, onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  const openState = useCloseOnEscape({ open, defaultOpen, onOpenChange });

  return <TooltipPrimitive.Root data-slot="tooltip" {...openState} {...props} />;
}

export function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

export function TooltipContent({
  className,
  sideOffset = 0,
  side,
  align,
  anchor,
  hideWhenDetached,
  container,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'anchor'> &
  Pick<PositionedContentProps, 'container'> & {
    /** Hides the tooltip while its trigger is scrolled out of view. */
    hideWhenDetached?: boolean;
  }) {
  return (
    <TooltipPrimitive.Portal container={container}>
      <TooltipPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        anchor={anchor}
        className={cn('z-200', hideWhenDetached && 'data-anchor-hidden:hidden')}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            'data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-max max-w-xs origin-(--transform-origin) text-balance rounded-md bg-muted-foreground px-3 py-1.5 text-primary-foreground text-xs data-closed:animate-out data-open:animate-in max-sm:hidden',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
