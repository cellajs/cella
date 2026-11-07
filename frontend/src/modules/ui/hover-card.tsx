import { PreviewCard as PreviewCardPrimitive } from '@base-ui/react/preview-card';
import { useCloseOnEscape } from '~/hooks/use-close-on-escape';
import type { PositionedContentProps } from '~/modules/ui/popover';
import { cn } from '~/utils/cn';

/** Previews the content behind a link on hover or keyboard focus of its trigger; Escape closes it from anywhere. */
export function HoverCard({ open, defaultOpen, onOpenChange, ...props }: PreviewCardPrimitive.Root.Props) {
  const openState = useCloseOnEscape({ open, defaultOpen, onOpenChange });

  return <PreviewCardPrimitive.Root data-slot="hover-card" {...openState} {...props} />;
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
  Pick<PreviewCardPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> &
  PositionedContentProps) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal" container={container}>
      <PreviewCardPrimitive.Positioner {...{ align, alignOffset, side, sideOffset }} className={cn('isolate z-200', positionerClassName)}>
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 bg-popover text-popover-foreground data-closed:animate-out data-open:animate-in w-64 origin-(--transform-origin) rounded-md border p-4 text-sm shadow-md outline-hidden',
            className,
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}
