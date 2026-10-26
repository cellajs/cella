import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import type * as React from 'react';
import { HeaderClose } from '~/modules/ui/dialog';
import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

export function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

export function SheetTrigger({ ...props }: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

export function SheetClose({ ...props }: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
      className={cn(
        'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 z-113 bg-overlay data-closed:animate-out data-open:animate-in',
        // Same duration as the popup, which Base UI waits on before unmounting; forwards keeps the overlay hidden until then
        'data-closed:fill-mode-forwards data-closed:duration-300 data-open:duration-300',
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
  autoScrollOnDrag,
  keepMounted,
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: 'top' | 'right' | 'bottom' | 'left';
  overlay?: boolean;
  container?: HTMLElement | null;
  autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  /** Passed to the Base UI portal: the closed popup stays in the DOM, hidden. */
  keepMounted?: boolean;
}) {
  const content = (
    <SheetPrimitive.Popup
      data-slot="sheet-content"
      className={cn(
        'flex flex-col bg-background shadow-lg focus-visible:outline-hidden',
        !container && 'fixed z-114 transition data-closed:animate-out data-open:animate-in data-closed:duration-300 data-open:duration-300',
        !container &&
          side === 'right' &&
          'data-closed:slide-out-to-right data-open:slide-in-from-right inset-y-0 right-0 h-full w-[95vw] sm:w-[90vw] lg:max-w-4xl',
        !container &&
          side === 'left' &&
          'data-closed:slide-out-to-left data-open:slide-in-from-left inset-y-0 left-0 h-full w-[95vw] sm:w-[90vw] lg:max-w-4xl',
        !container && side === 'top' && 'data-closed:slide-out-to-top data-open:slide-in-from-top inset-x-0 top-0 h-auto',
        !container && side === 'bottom' && 'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom inset-x-0 bottom-0 h-auto',
        container && 'relative size-full',
        className,
      )}
      {...props}
    >
      <ScrollArea className="size-full" viewportClassName="touch-pan-y" autoScrollOnDrag={autoScrollOnDrag}>
        {children}
      </ScrollArea>
    </SheetPrimitive.Popup>
  );

  if (container) {
    return (
      <SheetPortal container={container} keepMounted={keepMounted}>
        {content}
      </SheetPortal>
    );
  }

  return (
    <SheetPortal keepMounted={keepMounted}>
      {overlay && <SheetOverlay />}
      {content}
    </SheetPortal>
  );
}

export function SheetHeader({ className, sticky, children, ...props }: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('group/header relative flex flex-col gap-1.5 p-4', sticky && 'sticky top-0 z-10 bg-background/70 backdrop-blur-xs', className)}
      {...props}
    >
      {children}
      <HeaderClose />
    </div>
  );
}

export function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('font-semibold text-foreground', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
