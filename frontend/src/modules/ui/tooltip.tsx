import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { useCloseOnEscape } from '~/hooks/use-close-on-escape';
import type { PositionedContentProps } from '~/modules/ui/popover';
import { popupMotionClass } from '~/modules/ui/popup-motion';
import { cn } from '~/utils/cn';

export function TooltipProvider({ delay = 200, ...props }: TooltipPrimitive.Provider.Props) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" delay={delay} {...props} />;
}

/** Escape closes the tooltip from anywhere, also inside a sheet or dialog. Not hoverable: a text label kept open under the pointer covers what it moves on to. */
export function Tooltip({ open, defaultOpen, onOpenChange, disableHoverablePopup = true, ...props }: TooltipPrimitive.Root.Props) {
  const openState = useCloseOnEscape({ open, defaultOpen, onOpenChange });

  return <TooltipPrimitive.Root data-slot="tooltip" disableHoverablePopup={disableHoverablePopup} {...openState} {...props} />;
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
      <TooltipPrimitive.Positioner {...{ side, sideOffset, align, anchor }} className={cn('z-200', hideWhenDetached && 'data-anchor-hidden:hidden')}>
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            popupMotionClass,
            'bg-muted-foreground text-primary-foreground w-max max-w-xs rounded-md px-3 py-1.5 text-xs text-balance max-sm:hidden',
            className,
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}
