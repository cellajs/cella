import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { ScrollArea } from '~/modules/ui/scroll-area';
import { cn } from '~/utils/cn';

const DrawerVariants = cva('fixed z-118 flex flex-col bg-background outline-hidden', {
  variants: {
    direction: {
      top: 'inset-x-0 top-0 mb-24 flex-col',
      bottom: 'inset-x-0 bottom-0 mt-24 flex-col z-121',
      right: 'inset-y-0 right-0 w-[95vw] flex-row',
      left: 'inset-y-0 left-0 w-[95vw] flex-row',
    },
  },
  defaultVariants: {
    direction: 'bottom',
  },
});

const DrawerSliderVariants = cva('rounded-full absolute z-10 bg-muted', {
  variants: {
    direction: {
      top: 'bottom-1 mx-auto my-0.5 h-1 w-20 ml-[calc(50vw-2.5rem)]',
      bottom: 'top-1 mx-auto my-0.5 h-1 w-20 ml-[calc(50vw-2.5rem)]',
      right: 'left-0.5 mx-0.5 my-auto h-20 w-1 top-[calc(50vh-2.5rem)]',
      left: 'right-0.5 mx-0.5 my-auto h-20 w-1 top-[calc(50vh-2.5rem)]',
    },
  },
  defaultVariants: {
    direction: 'bottom',
  },
});

const Drawer = ({ shouldScaleBackground = true, ...props }: React.ComponentProps<typeof DrawerPrimitive.Root>) => (
  <DrawerPrimitive.Root shouldScaleBackground={shouldScaleBackground} {...props} />
);
Drawer.displayName = 'Drawer';

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = DrawerPrimitive.Portal;

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 bg-muted/30', className)} {...props} />);
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

export interface DrawerContentProps extends VariantProps<typeof DrawerVariants>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {}

const DrawerContent = React.forwardRef<React.ComponentRef<typeof DrawerPrimitive.Content>, DrawerContentProps & { isDropdown?: boolean }>(
  ({ className, direction = 'bottom', children, isDropdown = false, ...props }, ref) => {
    return (
      <DrawerPortal>
        <DrawerOverlay className={isDropdown ? 'z-300' : direction === 'bottom' ? 'z-120' : 'z-117 backdrop-blur-xs'} />
        <DrawerPrimitive.Content ref={ref} className={cn(DrawerVariants({ direction }), className)} {...props}>
          <div className={DrawerSliderVariants({ direction })} />
          <ScrollArea className="w-full h-full">{children} </ScrollArea>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    );
  },
);

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="drawer-header"
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[vaul-drawer-direction=bottom]/drawer-content:text-center group-data-[vaul-drawer-direction=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        className,
      )}
      {...props}
    />
  );
}
function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="drawer-footer" className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return <DrawerPrimitive.Title data-slot="drawer-title" className={cn('text-foreground font-semibold', className)} {...props} />;
}
function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return <DrawerPrimitive.Description data-slot="drawer-description" className={cn('text-muted-foreground text-sm', className)} {...props} />;
}
export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger };
