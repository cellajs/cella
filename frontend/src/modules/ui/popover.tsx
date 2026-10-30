import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { cn } from '~/utils/cn';

/** Props the positioned popups add to Base UI's; the select and the tooltip take `container` only. */
export interface PositionedContentProps {
  /** Part of @blocknote/shadcn's component contract: BlockNote portals the popup into the element usePortalElement() returns. */
  container?: PopoverPrimitive.Portal.Props['container'];
  /** Classes for the positioner, which owns the stacking layer: put z-index overrides here. */
  positionerClassName?: string;
}

/** Gap in px between a control and its popover, combobox, menu or select popup: the focus ring takes 4 (2 offset plus 2 ring), leaving 4 clear. */
export const popupSideOffset = 8;

/** Lets many triggers share one popover: pass it to the root and to each trigger, which hands its `payload` to the root. */
export const createPopoverHandle = PopoverPrimitive.createHandle;

export function Popover<Payload = unknown>({ ...props }: PopoverPrimitive.Root.Props<Payload>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

export function PopoverTrigger<Payload = unknown>({ ...props }: PopoverPrimitive.Trigger.Props<Payload>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

export function PopoverContent({
  className,
  align = 'center',
  sideOffset = popupSideOffset,
  side,
  alignOffset,
  anchor,
  collisionPadding,
  container,
  positionerClassName,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<PopoverPrimitive.Positioner.Props, 'side' | 'align' | 'sideOffset' | 'alignOffset' | 'anchor' | 'collisionPadding'> &
  PositionedContentProps) {
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
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-hidden data-closed:animate-out data-open:animate-in',
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}
