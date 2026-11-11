import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import { XIcon } from 'lucide-react';
import { type ComponentProps, createContext, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useStuck } from '~/hooks/use-stuck';
import { Button } from '~/modules/ui/button';
import { type HeaderBarProps, stuckEdgeClass } from '~/modules/ui/dialog';
import { cn } from '~/utils/cn';

export function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

export function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

export function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/** Seats a bottom sheet with text fields on the on-screen keyboard. Wraps `DrawerContent`, which renders the portal. */
export function DrawerVirtualKeyboardProvider({ ...props }: DrawerPrimitive.VirtualKeyboardProvider.Props) {
  return <DrawerPrimitive.VirtualKeyboardProvider {...props} />;
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'bg-overlay fixed inset-0 transition-opacity transition-discrete duration-300',
        // No data-open opacity: it outranks `starting:` (@starting-style), the only enter hook for a drawer mounted already
        // open, since Base UI skips data-starting-style then. Opacity defaults to 1.
        'data-closed:opacity-0',
        // One scrim: a drawer opened later dims the page, this drawer included
        'group-[:has(~[data-slot=drawer-portal]_[data-slot=drawer-content][data-open])]/drawer-portal:opacity-0',
        'data-starting-style:opacity-0 starting:opacity-0',
        'data-ending-style:opacity-0',
        'data-swiping:opacity-[calc(1-var(--drawer-swipe-progress,0))] data-swiping:transition-none',
        className,
      )}
      {...props}
    />
  );
}

export function DrawerContent({
  className,
  children,
  keepMounted,
  ...props
}: DrawerPrimitive.Popup.Props & {
  /** Keeps the closed drawer in the DOM with the `hidden` attribute, so reopening it skips the mount. */
  keepMounted?: boolean;
}) {
  return (
    // One stacking layer per drawer, so a drawer opened later covers an earlier one with its scrim
    <DrawerPortal
      keepMounted={keepMounted}
      className="group/drawer-portal relative z-118 has-data-[overlay=dialog]:z-126 has-data-[overlay=dropdown]:z-300"
    >
      <DrawerOverlay />
      {/* The on-screen keyboard overlays the layout viewport without resizing it, so DrawerVirtualKeyboardProvider's inset lifts the sheet. */}
      <DrawerPrimitive.Viewport className="fixed inset-0 flex pb-(--drawer-keyboard-inset,0px) has-data-[swipe-direction=down]:items-end has-data-[swipe-direction=down]:justify-center has-data-[swipe-direction=left]:items-stretch has-data-[swipe-direction=left]:justify-start has-data-[swipe-direction=right]:items-stretch has-data-[swipe-direction=right]:justify-end has-data-[swipe-direction=up]:items-start has-data-[swipe-direction=up]:justify-center">
        <DrawerPrimitive.Popup
          data-slot="drawer-content"
          className={cn(
            // The sheet's color sits on the scroller, which a bounce reveals. A caller sets `--sheet-bg`, not a fill on its content.
            'group/drawer-content flex touch-auto flex-col overflow-y-auto overscroll-none bg-(--sheet-bg) [--sheet-bg:var(--background)] focus-visible:outline-hidden',
            'transition-transform transition-discrete duration-300 ease-out will-change-transform',
            'data-swiping:transition-none! data-swiping:select-none',
            'data-[swipe-direction=down]:max-h-[min(80vh,calc(100%-1.25rem))] data-[swipe-direction=down]:w-full data-[swipe-direction=down]:rounded-t-lg',
            'data-[swipe-direction=up]:max-h-[80vh] data-[swipe-direction=up]:w-full data-[swipe-direction=up]:rounded-b-lg',
            'data-[swipe-direction=right]:w-[95vw] data-[swipe-direction=right]:lg:max-w-4xl',
            'data-[swipe-direction=left]:w-[95vw] data-[swipe-direction=left]:lg:max-w-4xl',
            // Bleed: a swipe away from the close direction lifts the popup off its edge, and a sheet-colored shadow fills the gap.
            // A caller's own shadow goes in `--sheet-edge-shadow`: a `shadow-*` class would replace the fill.
            'data-[swipe-direction=down]:shadow-[0_3rem_0_var(--sheet-bg),var(--sheet-edge-shadow,0_0_#0000)]',
            'data-[swipe-direction=up]:shadow-[0_-3rem_0_var(--sheet-bg),var(--sheet-edge-shadow,0_0_#0000)]',
            'data-[swipe-direction=right]:shadow-[3rem_0_0_var(--sheet-bg),var(--sheet-edge-shadow,0_0_#0000)]',
            'data-[swipe-direction=left]:shadow-[-3rem_0_0_var(--sheet-bg),var(--sheet-edge-shadow,0_0_#0000)]',
            // Per direction: where the popup rests (a swipe moves it along), and where it comes from and goes to
            'data-[swipe-direction=down]:[--drawer-out:translateY(100%)] data-[swipe-direction=down]:[--drawer-rest:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
            'data-[swipe-direction=up]:[--drawer-out:translateY(-100%)] data-[swipe-direction=up]:[--drawer-rest:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
            'data-[swipe-direction=right]:[--drawer-out:translateX(100%)] data-[swipe-direction=right]:[--drawer-rest:translateX(var(--drawer-swipe-movement-x,0px))]',
            'data-[swipe-direction=left]:[--drawer-out:translateX(-100%)] data-[swipe-direction=left]:[--drawer-rest:translateX(var(--drawer-swipe-movement-x,0px))]',
            // Enter: @starting-style natively, data-starting-style as Base UI's fallback. Under reduced motion it appears in place.
            'transform-(--drawer-rest) motion-safe:data-ending-style:transform-(--drawer-out) motion-safe:data-starting-style:transform-(--drawer-out) motion-safe:starting:transform-(--drawer-out)',
            className,
          )}
          {...props}
        >
          {/* Drag handle outside Content, with no data-swipe-ignore, so mouse/pointer swipe works here */}
          <div className="sticky top-0 z-20 flex shrink-0 cursor-grab items-center justify-center bg-(--sheet-bg) group-data-[swipe-direction=down]/drawer-content:py-2 group-data-[swipe-direction=left]/drawer-content:hidden group-data-[swipe-direction=right]/drawer-content:hidden group-data-[swipe-direction=up]/drawer-content:sticky group-data-[swipe-direction=up]/drawer-content:top-auto group-data-[swipe-direction=up]/drawer-content:bottom-0 group-data-[swipe-direction=up]/drawer-content:order-last group-data-[swipe-direction=up]/drawer-content:py-2 active:cursor-grabbing">
            <div className="bg-muted h-1 w-20 rounded-full" />
          </div>
          {/* shrink-0 keeps flex from collapsing Content, so the popup scrolls it. Content, not the popup, is the sheet layer:
              it spans the full scroll height, where a dim in the popup would scroll away with its first screen. */}
          <DrawerPrimitive.Content data-sheet-layer className="relative shrink-0">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}

/** The title bar of a drawer; a side drawer adds a close button, a bottom drawer closes by its handle. */
export function DrawerHeader({ className, sticky, closeButton, children, ...props }: HeaderBarProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useStuck(ref, !!sticky);

  return (
    <div
      ref={ref}
      data-slot="drawer-header"
      className={cn(
        'relative flex shrink-0 items-center gap-2 p-3 group-data-[swipe-direction=down]/drawer-content:justify-center group-data-[swipe-direction=up]/drawer-content:justify-center',
        // top-5 is the handle's height, py-2 around h-1
        sticky && ['sticky top-0 z-20 bg-(--sheet-bg) group-data-[swipe-direction=down]/drawer-content:top-5', stuckEdgeClass],
        className,
      )}
      {...props}
    >
      {children}
      {closeButton && (
        <DrawerPrimitive.Close data-slot="drawer-close" render={<Button variant="ghost" size="icon" />} className="-my-1 ml-auto size-7 shrink-0">
          <XIcon className="size-5" />
          <span className="sr-only">{t('c:close')}</span>
        </DrawerPrimitive.Close>
      )}
    </div>
  );
}

export function DrawerFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

/** A list of `Button variant="row"` rows on the sheet itself, without a fill of its own. */
export function DrawerRowGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div data-slot="drawer-row-group" className={cn('flex flex-col', className)} {...props} />;
}

/** The hairline between two groups of rows that do different kinds of things. */
export function DrawerRowSeparator({ className, ...props }: ComponentProps<'hr'>) {
  return <hr data-slot="drawer-row-separator" className={cn('border-border my-1.5 shrink-0', className)} {...props} />;
}

/** True inside a DrawerLead, whose names wrap with the sentence (see NamedText). */
export const DrawerLeadContext = createContext(false);

/**
 * The sentence above a drawer's rows that names what they act on, such as a `NamedText`: the sheet covers the row it came
 * from. A name in it wraps with the words before it, so it never moves to a line of its own.
 */
export function DrawerLead({ className, ...props }: ComponentProps<'p'>) {
  return (
    <DrawerLeadContext.Provider value={true}>
      {/* A margin, not padding: line-clamp clips at the padding box, so padding would show a sliver of the next line */}
      <p data-slot="drawer-lead" className={cn('my-3 text-center text-sm text-balance', className)} {...props} />
    </DrawerLeadContext.Provider>
  );
}

export function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn('text-foreground font-semibold', className)} {...props} />;
}

export function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn(
        'text-muted-foreground text-sm group-data-[swipe-direction=down]/drawer-content:text-center group-data-[swipe-direction=up]/drawer-content:text-center',
        className,
      )}
      {...props}
    />
  );
}
