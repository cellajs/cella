import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/utils/cn';

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogClose = DialogPrimitive.Close;

const DialogPortal = ({ ...props }: DialogPrimitive.DialogPortalProps) => <DialogPrimitive.Portal {...props} />;
DialogPortal.displayName = DialogPrimitive.Portal.displayName;

const DialogOverlay = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay> & { disabled?: boolean }
>(({ className, disabled, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      disabled
        ? ''
        : 'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-115 [.sheeter-open_&]:z-125 sm:grid place-items-center overflow-y-auto bg-muted/30 backdrop-blur-xs',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { container?: HTMLElement | null; hideClose?: boolean }
>(({ className, children, container, hideClose, id, ...props }, ref) => {
  const renderContent = () => (
    <DialogPrimitive.Content
      id={id}
      ref={ref}
      className={cn(
        'overflow-x-clip overflow-y-clip bg-background mt-4 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 relative z-116 [.sheeter-open_&]:z-126 grid w-[95vw] gap-4 p-4 shadow-lg duration-200 rounded-lg mx-auto',
        className,
      )}
      {...props}
    >
      {children}
      {!hideClose && (
        <DialogPrimitive.Close className="ring-offset-background focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none">
          <X className="h-6 w-6" strokeWidth={1.25} />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  );

  // EDIT: only wrap in Overlay if container is not provided
  return <DialogPortal container={container}>{container ? renderContent() : <DialogOverlay> {renderContent()}</DialogOverlay>}</DialogPortal>;
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col sm:flex-row sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<React.ComponentRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-6 tracking-tight', className)} {...props} />
  ),
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogHiddenTitle = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ ...props }, ref) => (
  <VisuallyHidden.Root>
    <DialogPrimitive.Title ref={ref} {...props} />
  </VisuallyHidden.Root>
));

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => <DialogPrimitive.Description ref={ref} className={cn('text-muted-foreground', className)} {...props} />);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogHiddenTitle,
  DialogOverlay,
  DialogTitle,
  DialogTrigger,
};
