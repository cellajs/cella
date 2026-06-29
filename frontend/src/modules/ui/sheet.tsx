import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

export function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose({ ...props }: SheetPrimitive.Close.Props & React.RefAttributes<HTMLButtonElement>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props & React.RefAttributes<HTMLDivElement>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-113 bg-muted/30 backdrop-blur-xs data-closed:animate-out data-open:animate-in',
        className,
      )}
      {...props}
    />
  );
}

export function SheetContent({
  className,
  children,
  side = 'right',
  overlay = true,
  container,
  initialFocus,
  finalFocus,
  autoScrollOnDrag,
  ...props
}: SheetPrimitive.Popup.Props &
  React.RefAttributes<HTMLDivElement> & {
    side?: 'top' | 'right' | 'bottom' | 'left';
    overlay?: boolean;
    container?: HTMLElement | null;
    initialFocus?: SheetPrimitive.Popup.Props['initialFocus'];
    finalFocus?: SheetPrimitive.Popup.Props['finalFocus'];
    /** Enable auto-scrolling when dragging elements near edges. */
    autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  }) {
  // When container is provided, render inline without portal/overlay
  const content = (
    <SheetPrimitive.Popup
      data-slot="sheet-content"
      initialFocus={initialFocus}
      finalFocus={finalFocus}
      className={cn(
        'flex flex-col bg-background shadow-lg focus-visible:outline-none',
        // Only apply animations and fixed positioning when not in container
        !container &&
          'fixed z-114 transition data-closed:animate-out data-open:animate-in data-closed:duration-300 data-open:duration-300',
        !container &&
          side === 'right' &&
          'data-closed:slide-out-to-right data-open:slide-in-from-right inset-y-0 right-0 h-full w-[95vw] sm:w-[90vw] lg:max-w-4xl',
        !container &&
          side === 'left' &&
          'data-closed:slide-out-to-left data-open:slide-in-from-left inset-y-0 left-0 h-full w-[95vw] sm:w-[90vw] lg:max-w-4xl',
        !container &&
          side === 'top' &&
          'data-closed:slide-out-to-top data-open:slide-in-from-top inset-x-0 top-0 h-auto',
        !container &&
          side === 'bottom' &&
          'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom inset-x-0 bottom-0 h-auto',
        container && 'relative h-full w-full',
        className,
      )}
      {...props}
    >
      <ScrollArea className="h-full w-full" viewportClassName="touch-pan-y" autoScrollOnDrag={autoScrollOnDrag}>
        {children}
      </ScrollArea>
    </SheetPrimitive.Popup>
  );

  // If container provided, portal to it without overlay
  if (container) {
    return <SheetPortal container={container}>{content}</SheetPortal>;
  }

  // Default: portal to body with optional overlay
  return (
    <SheetPortal>
      {overlay && <SheetOverlay />}
      {content}
    </SheetPortal>
  );
}

export function SheetHeader({
  className,
  sticky,
  children,
  ...props
}: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        'group/header relative flex flex-col gap-1.5 p-4',
        sticky && 'sticky top-0 z-10 bg-background/70 backdrop-blur-xs',
        className,
      )}
      {...props}
    >
      {children}
      <SheetPrimitive.Close
        data-slot="sheet-close"
        className="focus-effect absolute top-0 right-0 hidden rounded-sm p-1 opacity-70 transition-opacity hover:bg-accent hover:opacity-100 group-[.with-close-btn]/header:block data-disabled:pointer-events-none"
      >
        <XIcon className="size-5" strokeWidth={1.5} />
        <span className="sr-only">Close</span>
      </SheetPrimitive.Close>
    </div>
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

export function SheetTitle({
  className,
  ...props
}: SheetPrimitive.Title.Props & React.RefAttributes<HTMLParagraphElement>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn('font-semibold text-foreground', className)}
      {...props}
    />
  );
}

export function SheetDescription({
  className,
  ...props
}: SheetPrimitive.Description.Props & React.RefAttributes<HTMLParagraphElement>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}
