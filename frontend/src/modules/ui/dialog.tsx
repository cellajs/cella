import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { XIcon } from 'lucide-react';
import { type ComponentProps, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStuck } from '~/hooks/use-stuck';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';
import { tw } from '~/utils/tw';

// Below `sm` a dialog that is neither docked nor inline fills the screen above the keyboard
const phoneScreenClass = tw(
  'max-sm:m-0 max-sm:h-(--visual-viewport-height,100dvh) max-sm:max-h-none max-sm:w-full max-sm:content-start max-sm:self-start max-sm:overflow-y-auto max-sm:rounded-none max-sm:border-0 max-sm:pt-[calc(1rem+env(safe-area-inset-top))] max-sm:shadow-none max-sm:ring-0',
);

// A transition, so a close during the enter reverses from where the dialog is
const phoneMotionClass = tw(
  'max-sm:transition-[transform,opacity] max-sm:duration-350 max-sm:ease-out max-sm:data-closed:animate-none max-sm:data-ending-style:opacity-0 max-sm:data-ending-style:duration-250 max-sm:data-open:animate-none max-sm:data-starting-style:opacity-0 max-sm:starting:opacity-0',
);

// `--phone-rise` is where the dialog comes from and goes back to; a caller's inline value wins over the 144px default
const phoneRiseClass = tw(
  'max-sm:[--phone-rise:144px] max-sm:data-ending-style:transform-[translateY(var(--phone-rise))] max-sm:data-starting-style:transform-[translateY(var(--phone-rise))] max-sm:motion-reduce:data-ending-style:transform-none max-sm:motion-reduce:data-starting-style:transform-none max-sm:starting:transform-[translateY(var(--phone-rise))] max-sm:motion-reduce:starting:transform-none',
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
        'data-closed:fade-out-0 data-open:fade-in-0 bg-overlay data-closed:animate-out data-open:animate-in data-closed:fill-mode-forwards fixed inset-0 z-115 duration-200 in-[.sheeter-open]:z-125',
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
  outsideScroll,
  viewportClassName,
  dock,
  ...props
}: DialogPrimitive.Popup.Props & {
  container?: HTMLElement | null;
  /** A positioned element the backdrop and viewport cover in place of the screen, e.g. a sheet's layer. */
  layer?: HTMLElement | null;
  /** Scroll tall content inside the popup by default, or outside through the viewport. */
  outsideScroll?: boolean;
  viewportClassName?: string;
  /** Sits at the bottom edge and rises from below the screen. */
  dock?: 'bottom';
}) {
  return (
    <DialogPortal container={container || layer || undefined}>
      {!container && <DialogOverlay className={cn(layer && 'absolute', !dock && phoneMotionClass)} />}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className={cn(
          !container && [
            'inset-0 z-115 in-[.sheeter-open]:z-125',
            layer ? 'absolute' : 'fixed',
            dock
              ? 'grid items-end justify-items-center overflow-hidden p-4'
              : outsideScroll
                ? 'flex flex-col items-center overflow-y-auto overscroll-none p-4 max-sm:p-0'
                : 'grid place-items-center overflow-hidden',
          ],
          viewportClassName,
        )}
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-dock={dock}
          className={cn(
            'data-closed:fade-out-0 data-open:fade-in-0 bg-background data-closed:animate-out data-open:animate-in relative mx-auto grid w-[95vw] max-w-full grid-cols-1 gap-4 overflow-x-clip overscroll-none rounded-lg p-4 shadow-lg duration-200 focus-visible:outline-hidden',
            dock
              ? 'data-closed:slide-out-to-bottom data-open:slide-in-from-bottom shadow-floating duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
              : 'sm:data-closed:zoom-out-95 sm:data-open:zoom-in-95',
            // A container owns the scroll, so the popup only clips
            container ? 'mt-4 overflow-y-clip' : outsideScroll ? 'my-auto' : 'max-h-[calc(100%-2rem)] overflow-y-auto',
            !dock && !container && [phoneScreenClass, phoneMotionClass, phoneRiseClass],
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

/** The hairline under a sticky header bar, shown while content scrolls beneath it (`useStuck`). */
export const stuckEdgeClass = tw(
  'after:bg-border after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:opacity-0 after:transition-opacity data-stuck:after:opacity-100',
);

export interface HeaderBarProps extends Omit<ComponentProps<'div'>, 'ref'> {
  /** Only this bar sticks: a description renders after it and scrolls away with the content. */
  sticky?: boolean;
  closeButton?: boolean;
}

/** The title bar of a dialog: the title, anything placed after it and a close button, on one row. */
export function DialogHeader({ className, sticky, closeButton = true, children, ...props }: HeaderBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  useStuck(ref, !!sticky);

  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn(
        'relative flex shrink-0 items-center gap-2 text-left',
        // 1rem shadows cover the scroller's padding and the popup's gap; a description starts after that gap, so they never cover it
        sticky && [
          'bg-background sticky top-0 z-10 shadow-[0_-1rem_var(--color-background),0_1rem_var(--color-background)]',
          stuckEdgeClass,
          'after:-inset-x-4 after:-bottom-4',
        ],
        className,
      )}
      {...props}
    >
      {children}
      {closeButton && <HeaderClose />}
    </div>
  );
}

/** The close button that ends a dialog or sheet header bar. */
export function HeaderClose() {
  const { t } = useTranslation();

  return (
    <DialogPrimitive.Close data-slot="dialog-close" render={<Button variant="ghost" size="icon" />} className="-my-1 ml-auto size-7 shrink-0">
      <XIcon className="size-5" />
      <span className="sr-only">{t('c:close')}</span>
    </DialogPrimitive.Close>
  );
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="dialog-footer" className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />;
}

export function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return <DialogPrimitive.Title data-slot="dialog-title" className={cn('leading-none font-semibold', className)} {...props} />;
}

export function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return <DialogPrimitive.Description data-slot="dialog-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
