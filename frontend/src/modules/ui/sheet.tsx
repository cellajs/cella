import { Dialog as SheetPrimitive } from '@base-ui/react/dialog';
import { type ComponentProps, useRef } from 'react';
import { useStuck } from '~/hooks/use-stuck';
import { type HeaderBarProps, HeaderClose, stuckEdgeClass } from '~/modules/ui/dialog';
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
        'bg-overlay fixed inset-0 z-113 transition-opacity transition-discrete duration-300',
        // As the drawer overlay: `starting:` is the enter of a kept sheet, which Base UI gives no data-starting-style
        'data-closed:opacity-0 data-ending-style:opacity-0 data-starting-style:opacity-0 starting:opacity-0',
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
      data-sheet-layer
      className={cn(
        // The sheet's color sits on the popup, which a bounce of the scroll area reveals. A caller sets `--sheet-bg`, not a fill on its content.
        'flex flex-col bg-(--sheet-bg) shadow-lg [--sheet-bg:var(--background)] focus-visible:outline-hidden',
        // Travels in from its edge as a transition; under reduced motion it appears in place
        !container && 'fixed z-114 transition-transform transition-discrete duration-300 ease-out',
        !container &&
          side === 'right' &&
          'inset-y-0 right-0 h-full w-[95vw] motion-safe:data-ending-style:translate-x-full motion-safe:data-starting-style:translate-x-full sm:w-[90vw] lg:max-w-4xl motion-safe:starting:translate-x-full',
        !container &&
          side === 'left' &&
          'inset-y-0 left-0 h-full w-[95vw] motion-safe:data-ending-style:-translate-x-full motion-safe:data-starting-style:-translate-x-full sm:w-[90vw] lg:max-w-4xl motion-safe:starting:-translate-x-full',
        !container &&
          side === 'top' &&
          'inset-x-0 top-0 h-auto motion-safe:data-ending-style:-translate-y-full motion-safe:data-starting-style:-translate-y-full motion-safe:starting:-translate-y-full',
        !container &&
          side === 'bottom' &&
          'inset-x-0 bottom-0 h-auto motion-safe:data-ending-style:translate-y-full motion-safe:data-starting-style:translate-y-full motion-safe:starting:translate-y-full',
        container && 'relative size-full',
        className,
      )}
      {...props}
    >
      <ScrollArea className="size-full" viewportClassName="touch-pan-y overscroll-none" autoScrollOnDrag={autoScrollOnDrag}>
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

/** The title bar of a sheet: the title, anything placed after it and a close button, on one row. */
export function SheetHeader({ className, sticky, closeButton = true, children, ...props }: HeaderBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStuck(ref, !!sticky);

  return (
    <div
      ref={ref}
      data-slot="sheet-header"
      className={cn('relative flex shrink-0 items-center gap-2 p-4', sticky && ['sticky top-0 z-10 bg-(--sheet-bg)', stuckEdgeClass], className)}
      {...props}
    >
      {children}
      {closeButton && <HeaderClose />}
    </div>
  );
}

export function SheetFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="sheet-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return <SheetPrimitive.Title data-slot="sheet-title" className={cn('text-foreground font-semibold', className)} {...props} />;
}

export function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return <SheetPrimitive.Description data-slot="sheet-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
