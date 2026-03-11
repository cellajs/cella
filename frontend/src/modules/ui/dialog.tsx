import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';
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
          : 'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-115 in-[.sheeter-open]:z-125 bg-muted/30 backdrop-blur-xs',
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
  showCloseButton = true,
  initialFocus,
  finalFocus,
  ...props
}: DialogPrimitive.Popup.Props &
  React.RefAttributes<HTMLDivElement> & {
    showCloseButton?: boolean;
    container?: HTMLElement | null;
    initialFocus?: DialogPrimitive.Popup.Props['initialFocus'];
    finalFocus?: DialogPrimitive.Popup.Props['finalFocus'];
  }) {
  return (
    <DialogPortal container={container || undefined}>
      {!container && <DialogOverlay />}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className={cn(
          !container && 'fixed inset-0 z-115 in-[.sheeter-open]:z-125 sm:grid place-items-center overflow-y-auto',
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          initialFocus={initialFocus}
          finalFocus={finalFocus}
          className={cn(
            'overflow-x-clip overflow-y-clip max-sm:overflow-y-auto max-sm:max-h-[85vh] bg-background mt-4 data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 relative z-116 in-[.sheeter-open]:z-126 grid w-[95vw] gap-4 p-4 shadow-lg duration-200 rounded-lg mx-auto',
            className,
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close"
              className="data-open:bg-accent data-open:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-effect disabled:pointer-events-none"
            >
              <XIcon className="size-5" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

function DialogHeader({ className, sticky, ...props }: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'flex flex-col gap-2 text-center sm:text-left',
        sticky && 'sticky top-0 z-10 bg-background/70 backdrop-blur-xs',
        className,
      )}
      {...props}
    />
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
      className={cn('text-lg leading-none font-semibold', className)}
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
