import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '~/utils/cn';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 in-[.sheeter-open]:z-125 z-115 bg-overlay backdrop-blur-xs duration-200 data-closed:animate-out data-open:animate-in data-closed:fill-mode-forwards',
        className,
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  container,
  outsideScroll = false,
  viewportClassName,
  ...props
}: DialogPrimitive.Popup.Props & {
  container?: HTMLElement | null;
  /** Scroll tall content inside the popup by default, or outside through the viewport. */
  outsideScroll?: boolean;
  viewportClassName?: string;
}) {
  return (
    <DialogPortal container={container || undefined}>
      {!container && <DialogOverlay />}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className={cn(
          !container && [
            'fixed inset-0 in-[.sheeter-open]:z-125 z-115',
            outsideScroll
              ? // Outside scroll: the viewport scrolls, and its p-4 keeps a gap that the popup's max-w-full respects on narrow screens.
                'flex flex-col items-center overflow-y-auto p-4'
              : // Inside scroll: the viewport only centers; the popup is capped and scrolls internally.
                'grid place-items-center overflow-hidden',
          ],
          viewportClassName,
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 relative in-[.sheeter-open]:z-126 z-116 mx-auto grid w-[95vw] max-w-full grid-cols-1 gap-4 overflow-x-clip rounded-lg bg-background p-4 shadow-lg duration-200 focus-visible:outline-hidden data-closed:animate-out data-open:animate-in',
            // A container owns the scroll, so the popup only clips; inside scroll caps the height to keep a screen-edge gap.
            container ? 'mt-4 overflow-y-clip' : outsideScroll ? 'my-auto' : 'max-h-[calc(100%-2rem)] overflow-y-auto',
            className,
          )}
          {...props}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, sticky, children, ...props }: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'group/header relative flex flex-col gap-2 text-left',
        // Shadows in the background colour, 1rem up and down, cover the scroller's padding above and the gap below while it sticks.
        sticky && 'z-10 sm:sticky sm:top-0 sm:bg-background sm:shadow-[0_-1rem_var(--color-background),0_1rem_var(--color-background)]',
        className,
      )}
      {...props}
    >
      {children}
      <HeaderClose />
    </div>
  );
}

/** The close button of a dialog or sheet header, shown when the header has the `with-close-btn` class. */
export function HeaderClose() {
  const { t } = useTranslation();

  return (
    <DialogPrimitive.Close
      data-slot="dialog-close"
      className="focus-effect absolute top-0 right-0 hidden rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 group-[.with-close-btn]/header:block data-disabled:pointer-events-none"
    >
      <XIcon className="size-5" />
      <span className="sr-only">{t('c:close')}</span>
    </DialogPrimitive.Close>
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('font-semibold leading-none', className)} {...props} />;
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger };
