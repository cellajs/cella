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
      <PreviewCardPrimitive.Positioner {...{ side, sideOffset, align, alignOffset }} className={cn('isolate z-200', positionerClassName)}>
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn('popup-motion', 'bg-popover text-popover-foreground w-64 rounded-md border p-4 text-sm shadow-md outline-hidden', className)}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  );
}
