import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { DrawerPreview as DrawerPrimitive } from '@base-ui/react/drawer';
import * as React from 'react';
import { cn } from '~/utils/cn';

function Drawer({ ...props }: DrawerPrimitive.Root.Props) {
  return <DrawerPrimitive.Root data-slot="drawer" {...props} />;
}

function DrawerTrigger({ ...props }: DrawerPrimitive.Trigger.Props & React.RefAttributes<HTMLElement>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props & React.RefAttributes<HTMLDivElement>) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />;
}

function DrawerClose({ ...props }: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props & React.RefAttributes<HTMLDivElement>) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        'fixed inset-0 z-117 group-has-data-[overlay=dialog]/drawer-portal:z-125 group-has-data-[overlay=dropdown]/drawer-portal:z-299 bg-black/50 transition-opacity transition-discrete duration-300',
        'data-open:opacity-100 data-closed:opacity-0',
        'starting:opacity-0 data-starting-style:opacity-0',
        'data-ending-style:opacity-0',
        'data-swiping:transition-none data-swiping:opacity-[calc(1-var(--drawer-swipe-progress,0))]',
        className,
      )}
      {...props}
    />
  );
}

function DrawerContent({
  className,
  children,
  autoScrollOnDrag,
  ...props
}: DrawerPrimitive.Popup.Props &
  React.RefAttributes<HTMLDivElement> & {
    /** Enable auto-scrolling when dragging elements near edges. */
    autoScrollOnDrag?: boolean | 'vertical' | 'horizontal';
  }) {
  const popupRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!autoScrollOnDrag || !popupRef.current) return;
    const axis = typeof autoScrollOnDrag === 'string' ? autoScrollOnDrag : undefined;
    return autoScrollForElements({
      element: popupRef.current,
      ...(axis && { getAllowedAxis: () => axis }),
    });
  }, [autoScrollOnDrag]);

  return (
    <DrawerPortal>
      <div className="contents group/drawer-portal">
        <DrawerOverlay />
        <DrawerPrimitive.Viewport
          className={cn(
            'fixed inset-0 z-118 group-has-data-[overlay=dialog]/drawer-portal:z-126 group-has-data-[overlay=dropdown]/drawer-portal:z-300 flex',
            // Viewport handles Popup positioning via flex alignment, using :has() to detect swipe direction
            'has-data-[swipe-direction=down]:items-end has-data-[swipe-direction=down]:justify-center',
            'has-data-[swipe-direction=up]:items-start has-data-[swipe-direction=up]:justify-center',
            'has-data-[swipe-direction=right]:items-stretch has-data-[swipe-direction=right]:justify-end',
            'has-data-[swipe-direction=left]:items-stretch has-data-[swipe-direction=left]:justify-start',
          )}
        >
          <DrawerPrimitive.Popup
            ref={popupRef}
            data-slot="drawer-content"
            className={cn(
              // Popup is a flex child of Viewport — NOT position:fixed. Scrolls via overflow-y-auto.
              'group/drawer-content bg-background flex flex-col overflow-y-auto overscroll-contain touch-auto',
              'will-change-transform transition-transform transition-discrete duration-300 ease-out',
              'data-swiping:transition-none! data-swiping:select-none',
              // Sizing by swipe direction (Viewport flex handles placement)
              'data-[swipe-direction=down]:w-full data-[swipe-direction=down]:max-h-[80vh] data-[swipe-direction=down]:rounded-t-lg',
              'data-[swipe-direction=up]:w-full data-[swipe-direction=up]:max-h-[80vh] data-[swipe-direction=up]:rounded-b-lg',
              'data-[swipe-direction=right]:w-[95vw] data-[swipe-direction=right]:lg:max-w-4xl',
              'data-[swipe-direction=left]:w-[95vw] data-[swipe-direction=left]:lg:max-w-4xl',
              // Swipe transforms - idle position using CSS vars
              'data-[swipe-direction=down]:transform-[translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
              'data-[swipe-direction=up]:transform-[translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))]',
              'data-[swipe-direction=right]:transform-[translateX(var(--drawer-swipe-movement-x,0px))]',
              'data-[swipe-direction=left]:transform-[translateX(var(--drawer-swipe-movement-x,0px))]',
              // Enter animation — CSS @starting-style (native) + data-starting-style (Base UI fallback)
              'starting:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'starting:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'starting:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'starting:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              'data-starting-style:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'data-starting-style:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'data-starting-style:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'data-starting-style:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              // Exit animation — off-screen (driven by Base UI data-ending-style attribute)
              'data-ending-style:data-[swipe-direction=down]:transform-[translateY(100%)]',
              'data-ending-style:data-[swipe-direction=up]:transform-[translateY(-100%)]',
              'data-ending-style:data-[swipe-direction=right]:transform-[translateX(100%)]',
              'data-ending-style:data-[swipe-direction=left]:transform-[translateX(-100%)]',
              className,
            )}
            {...props}
          >
            {/* Drag handle — outside Content (no data-swipe-ignore) so mouse/pointer swipe works here. Hidden on left/right. */}
            <div
              className={cn(
                'flex shrink-0 cursor-grab items-center justify-center active:cursor-grabbing',
                'group-data-[swipe-direction=down]/drawer-content:py-2',
                'group-data-[swipe-direction=up]/drawer-content:order-last group-data-[swipe-direction=up]/drawer-content:py-2',
                'group-data-[swipe-direction=left]/drawer-content:hidden group-data-[swipe-direction=right]/drawer-content:hidden',
              )}
            >
              <div className="bg-muted h-1 w-20 rounded-full" />
            </div>
            {/* shrink-0 prevents flex from collapsing Content — children grow naturally, Popup scrolls when overflow */}
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
        'flex flex-col gap-0.5 p-4 group-data-[swipe-direction=down]/drawer-content:text-center group-data-[swipe-direction=up]/drawer-content:text-center md:gap-1.5 md:text-left',
        sticky && 'sticky top-0 z-10 bg-background/70 backdrop-blur-xs',
        className,
      )}
      {...props}
    />
  );
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('text-foreground font-semibold', className)}
      {...props}
    />
  );
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-muted-foreground text-sm', className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
};
