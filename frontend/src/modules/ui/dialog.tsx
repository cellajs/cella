import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import type * as React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

// Below `sm` a dialog that is neither docked nor inline fills the screen above the keyboard and rises from the bottom; its
// content scrolls under a sticky header. A drawer is the other form a phone shows a dialog in.
const phoneScreenClass = tw(
  'max-sm:data-closed:slide-out-to-bottom max-sm:data-open:slide-in-from-bottom max-sm:m-0 max-sm:h-(--visual-viewport-height,100dvh) max-sm:max-h-none max-sm:w-full max-sm:content-start max-sm:self-start max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0 max-sm:pt-[calc(1rem+env(safe-area-inset-top))] max-sm:shadow-none max-sm:ring-0',
);

/** Writes the visual viewport's height on its dialog, so a full screen dialog ends at the keyboard's edge; kept off :root, a keyboard opening restyles only that subtree. */
function VisualViewportHeight() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    const popup = ref.current?.closest<HTMLElement>('[data-slot="dialog-content"]');
    if (!viewport || !popup) return;

    const update = () => popup.style.setProperty('--visual-viewport-height', `${viewport.height}px`);
    update();
    viewport.addEventListener('resize', update);
    return () => viewport.removeEventListener('resize', update);
  }, []);

  return <span ref={ref} hidden />;
}

export function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

export function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

export function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        'data-closed:fade-out-0 data-open:fade-in-0 fixed inset-0 in-[.sheeter-open]:z-125 z-115 bg-overlay duration-200 data-closed:animate-out data-open:animate-in data-closed:fill-mode-forwards',
        className,
      )}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  container,
  layer,
  outsideScroll = false,
  viewportClassName,
  overlayClassName,
  dock,
  ...props
}: DialogPrimitive.Popup.Props & {
  container?: HTMLElement | null;
  /** A positioned element the backdrop and viewport cover in place of the screen, e.g. a sheet's layer. */
  layer?: HTMLElement | null;
  /** Scroll tall content inside the popup by default, or outside through the viewport. */
  outsideScroll?: boolean;
  viewportClassName?: string;
  /** Classes of the backdrop, e.g. to leave it out where the popup covers the screen. */
  overlayClassName?: string;
  /** Sits at the bottom edge and rises from below the screen. */
  dock?: 'bottom';
}) {
  return (
    <DialogPortal container={container || layer || undefined}>
      {!container && <DialogOverlay className={cn(layer && 'absolute', overlayClassName)} />}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className={cn(
          !container && [
            'inset-0 in-[.sheeter-open]:z-125 z-115',
            layer ? 'absolute' : 'fixed',
            dock
              ? 'grid items-end justify-items-center overflow-hidden p-4'
              : outsideScroll
                ? // Outside scroll: the viewport scrolls, and its p-4 keeps a gap that the popup's max-w-full respects on narrow screens.
                  'flex flex-col items-center overflow-y-auto p-4 max-sm:p-0'
                : // Inside scroll: the viewport only centers; the popup is capped and scrolls internally.
                  'grid place-items-center overflow-hidden',
          ],
          viewportClassName,
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-dock={dock}
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 relative mx-auto grid w-[95vw] max-w-full grid-cols-1 gap-4 overflow-x-clip rounded-lg bg-background p-4 shadow-lg duration-200 focus-visible:outline-hidden data-closed:animate-out data-open:animate-in',
            dock
              ? 'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom shadow-floating duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
              : 'sm:data-closed:zoom-out-95 sm:data-open:zoom-in-95',
            // A container owns the scroll, so the popup only clips; inside scroll caps the height to keep a screen-edge gap.
            container ? 'mt-4 overflow-y-clip' : outsideScroll ? 'my-auto' : 'max-h-[calc(100%-2rem)] overflow-y-auto',
            !dock && !container && phoneScreenClass,
            className,
          )}
          {...props}
        >
          <VisualViewportHeight />
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  );
}

export function DialogHeader({ className, sticky, children, ...props }: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        'group/header relative flex flex-col gap-2 text-left',
        // Shadows in the background colour, 1rem up and down, cover the scroller's padding above and the gap below while it sticks.
        sticky && 'sticky top-0 z-10 bg-background shadow-[0_-1rem_var(--color-background),0_1rem_var(--color-background)]',
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
      render={<Button variant="ghost" size="icon" />}
      className="absolute top-0 right-0 hidden size-7 group-[.with-close-btn]/header:inline-flex"
    >
      <XIcon className="size-5" />
      <span className="sr-only">{t('c:close')}</span>
    </DialogPrimitive.Close>
  );
}

export function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('font-semibold leading-none', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
