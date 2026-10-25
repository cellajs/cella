import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer';
import type * as React from 'react';
import { cn } from '~/utils/cn';

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

/** Seats a bottom sheet with text fields on the on-screen keyboard. Wraps `DrawerContent`, which renders the portal. */
function DrawerVirtualKeyboardProvider({ ...props }: DrawerPrimitive.VirtualKeyboardProvider.Props) {
  return <DrawerPrimitive.VirtualKeyboardProvider {...props} />;
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-117 bg-overlay transition-discrete transition-opacity duration-300 group-has-data-[overlay=dialog]/drawer-portal:z-125 group-has-data-[overlay=dropdown]/drawer-portal:z-299',
        // No data-open opacity: it outranks `starting:` (@starting-style), the only enter hook for a drawer mounted already
        // open, since Base UI skips data-starting-style then. Opacity defaults to 1.
        'data-closed:opacity-0',
        'starting:opacity-0 data-starting-style:opacity-0',
        'data-ending-style:opacity-0',
        'data-swiping:opacity-[calc(1-var(--drawer-swipe-progress,0))] data-swiping:transition-none',
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  keepMounted,
  ...props
}: DrawerPrimitive.Popup.Props & {
  /** Keeps the closed drawer in the DOM with the `hidden` attribute, so reopening it skips the mount. */
  keepMounted?: boolean;
}) {
  return (
    <DrawerPortal keepMounted={keepMounted}>
      <div className="group/drawer-portal contents">
        <DrawerOverlay />
        {/* The on-screen keyboard overlays the layout viewport without resizing it, so DrawerVirtualKeyboardProvider's inset lifts the sheet. */}
        <DrawerPrimitive.Viewport className="fixed inset-0 z-118 flex pb-(--drawer-keyboard-inset,0px) has-data-[swipe-direction=up]:items-start has-data-[swipe-direction=down]:items-end has-data-[swipe-direction=left]:items-stretch has-data-[swipe-direction=right]:items-stretch has-data-[swipe-direction=left]:justify-start has-data-[swipe-direction=right]:justify-end has-data-[swipe-direction=down]:justify-center has-data-[swipe-direction=up]:justify-center group-has-data-[overlay=dialog]/drawer-portal:z-126 group-has-data-[overlay=dropdown]/drawer-portal:z-300">
          <DrawerPrimitive.Popup
            data-slot="drawer-content"
            className={cn(
              'group/drawer-content flex touch-auto flex-col overflow-y-auto overscroll-contain bg-background focus-visible:outline-hidden',
              'transition-discrete transition-transform duration-300 ease-out will-change-transform',
              'data-swiping:select-none data-swiping:transition-none!',
              // Sizing by swipe direction (Viewport flex handles placement)
              'data-[swipe-direction=down]:max-h-[min(80vh,calc(100%-1.25rem))] data-[swipe-direction=down]:w-full data-[swipe-direction=down]:rounded-t-lg',
              'data-[swipe-direction=up]:max-h-[80vh] data-[swipe-direction=up]:w-full data-[swipe-direction=up]:rounded-b-lg',
              'data-[swipe-direction=right]:w-[95vw] data-[swipe-direction=right]:lg:max-w-4xl',
              'data-[swipe-direction=left]:w-[95vw] data-[swipe-direction=left]:lg:max-w-4xl',
              // Bleed: a swipe away from the close direction lifts the popup off its screen edge (damped, ~30px).
              // A background-colored shadow on that edge fills the gap without touching layout or scroll.
              'data-[swipe-direction=down]:shadow-[0_3rem_0_var(--color-background)]',
              'data-[swipe-direction=up]:shadow-[0_-3rem_0_var(--color-background)]',
              'data-[swipe-direction=right]:shadow-[3rem_0_0_var(--color-background)]',
              'data-[swipe-direction=left]:shadow-[-3rem_0_0_var(--color-background)]',
              // Position at rest and while dragged, from Base UI's snap-point and swipe variables.
              'data-[swipe-direction=down]:transform-[translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
              'data-[swipe-direction=up]:transform-[translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
              'data-[swipe-direction=right]:transform-[translateX(var(--drawer-swipe-movement-x,0px))]',
              'data-[swipe-direction=left]:transform-[translateX(var(--drawer-swipe-movement-x,0px))]',
              // Enter animation: CSS @starting-style (native) and data-starting-style (Base UI fallback).
              'starting:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'starting:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'starting:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'starting:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              'data-starting-style:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'data-starting-style:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'data-starting-style:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'data-starting-style:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              // Exit animation: off-screen, driven by Base UI data-ending-style.
              'data-ending-style:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'data-ending-style:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'data-ending-style:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'data-ending-style:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              className,
            )}
            {...props}
          >
            {/* Drag handle outside Content, with no data-swipe-ignore, so mouse/pointer swipe works here. Hidden on left/right. */}
            <div className="sticky top-0 z-20 flex shrink-0 cursor-grab items-center justify-center bg-background active:cursor-grabbing group-data-[swipe-direction=up]/drawer-content:sticky group-data-[swipe-direction=up]/drawer-content:top-auto group-data-[swipe-direction=up]/drawer-content:bottom-0 group-data-[swipe-direction=up]/drawer-content:order-last group-data-[swipe-direction=left]/drawer-content:hidden group-data-[swipe-direction=right]/drawer-content:hidden group-data-[swipe-direction=down]/drawer-content:py-2 group-data-[swipe-direction=up]/drawer-content:py-2">
              <div className="h-1 w-20 rounded-full bg-muted" />
            </div>
            {/* shrink-0 keeps flex from collapsing Content, so the popup scrolls it. */}
            <DrawerPrimitive.Content className="shrink-0">{children}</DrawerPrimitive.Content>
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </div>
    </DrawerPortal>
  );
}

function DrawerHeader({ className, sticky, ...props }: React.ComponentProps<'div'> & { sticky?: boolean }) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 pb-6 group-data-[swipe-direction=down]/drawer-content:text-center group-data-[swipe-direction=up]/drawer-content:text-center md:gap-1.5 md:text-left',
        sticky && 'sticky top-0 z-20 bg-background/70 backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

/** A list of `Button variant="row"` rows on the sheet itself, without a fill of its own. */
function DrawerRowGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-row-group" className={cn('flex flex-col', className)} {...props} />;
}

/** The hairline between two groups of rows that do different kinds of things. */
function DrawerRowSeparator({ className, ...props }: React.ComponentProps<'hr'>) {
  return <hr data-slot="drawer-row-separator" className={cn('my-1.5 shrink-0 border-border', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn('font-semibold text-foreground', className)} {...props} />;
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerRowGroup,
  DrawerRowSeparator,
  DrawerTitle,
  DrawerTrigger,
  DrawerVirtualKeyboardProvider,
};
