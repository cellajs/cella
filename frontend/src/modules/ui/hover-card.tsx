import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import { cn } from '~/utils/cn';

/** Preview of the content behind a link, shown on hover or keyboard focus of the trigger (Base UI Preview Card). */
export function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />;
}

/** Renders a link by default; `delay` and `closeDelay` set the open and close timing. */
export function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />;
}

export function HoverCardContent({
  className,
  side = 'bottom',
  sideOffset = 4,
  align = 'center',
  alignOffset = 4,
  container,
  positionerClassName,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<PreviewCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    container?: PreviewCardPrimitive.Portal.Props['container'];
    /** Classes for the positioner, which owns the stacking layer: put z-index overrides here. */
    positionerClassName?: string;
  }) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal" container={container}>
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className={cn('isolate z-200', positionerClassName)}
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 w-64 origin-(--transform-origin) rounded-md border bg-popover p-4 text-popover-foreground text-sm shadow-md outline-hidden data-closed:animate-out data-open:animate-in',
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}
