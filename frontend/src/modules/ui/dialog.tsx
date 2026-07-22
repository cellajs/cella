import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { cn } from '~/utils/cn';

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props & React.RefAttributes<HTMLDivElement>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props & React.RefAttributes<HTMLButtonElement>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
  className,
  disabled,
  ...props
}: DialogPrimitive.Backdrop.Props & React.RefAttributes<HTMLDivElement> & { disabled?: boolean }) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        disabled
          ? ''
          : 'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 in-[.sheeter-open]:z-125 z-115 bg-black/20 starting:opacity-0 backdrop-blur-xs data-closed:animate-out data-open:animate-in data-starting-style:opacity-0',
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
  initialFocus,
  finalFocus,
  outsideScroll = false,
  ...props
}: DialogPrimitive.Popup.Props &
  React.RefAttributes<HTMLDivElement> & {
    container?: HTMLElement | null;
    initialFocus?: DialogPrimitive.Popup.Props['initialFocus'];
    finalFocus?: DialogPrimitive.Popup.Props['finalFocus'];
    /** Scroll tall content inside the popup by default, or outside through the viewport. */
    outsideScroll?: boolean;
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
              ? // Outside scroll: the viewport scrolls; the popup grows past the edges (my-auto centers it, p-4 keeps a gap).
                'flex flex-col items-center overflow-y-auto p-4'
              : // Inside scroll: the viewport only centers; the popup is capped and scrolls internally.
                'grid place-items-center overflow-hidden',
          ],
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 relative in-[.sheeter-open]:z-126 z-116 mx-auto grid w-[95vw] starting:scale-95 grid-cols-[minmax(0,1fr)] gap-4 overflow-x-clip rounded-lg bg-background p-4 starting:opacity-0 shadow-lg duration-200 focus-visible:outline-none data-starting-style:scale-95 data-closed:animate-out data-open:animate-in data-starting-style:opacity-0',
            // Scroll-mode specific layout (skipped when rendered inside a container, which handles its own scroll).
            // Inside scroll keeps a screen-edge gap via max-height (full-bleed dialogs can override with `max-h-none`).
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
        sticky && 'z-10 sm:sticky sm:top-0 sm:bg-background/70 sm:backdrop-blur-xs',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        data-slot="dialog-close"
        className="focus-effect absolute top-0 right-0 hidden rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 group-[.with-close-btn]/header:block data-disabled:pointer-events-none"
      >
        <XIcon className="size-5" strokeWidth={1.5} />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </div>
  );
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props & React.RefAttributes<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('font-semibold leading-none', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props & React.RefAttributes<HTMLParagraphElement>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
};
