import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '~/utils/cn';

const DrawerVariants = cva('fixed z-118 p-4 flex flex-col rounded-t-2.5 bg-background', {
  variants: {
    direction: {
      top: 'inset-x-0 top-0 mb-24 flex-col',
      bottom: 'inset-x-0 bottom-0 mt-24 flex-col z-121',
      right: 'inset-y-0 right-0 w-[95vw] flex-row overflow-x-hidden',
      left: 'inset-y-0 left-0 w-[95vw] flex-row overflow-x-hidden',
    },
  },
  defaultVariants: {
    direction: 'bottom',
  },
});

const DrawerSliderVariants = cva('rounded-full absolute z-10 bg-muted', {
  variants: {
    direction: {
      top: 'bottom-1.5 mx-auto my-0.5 h-1 w-16 ml-[calc(50vw-2.5rem)]',
      bottom: 'top-1.5 mx-auto my-0.5 h-1 w-16 ml-[calc(50vw-2.5rem)]',
      right: 'left-1 mx-0.5 my-auto h-20 w-1 mt-[calc(50vh-3rem)]',
      left: 'right-1 mx-0.5 my-auto h-20 w-1 mt-[calc(50vh-3rem)]',
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
          <div className="w-full h-full">{children}</div>
        </DrawerPrimitive.Content>
      </DrawerPortal>
    );
  },
);

DrawerContent.displayName = 'DrawerContent';

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('grid gap-1.5 text-center pb-3 sm:text-left', className)} {...props} />
);
DrawerHeader.displayName = 'DrawerHeader';

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2', className)} {...props} />
);
DrawerFooter.displayName = 'DrawerFooter';

const DrawerTitle = React.forwardRef<React.ComponentRef<typeof DrawerPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DrawerPrimitive.Title ref={ref} className={cn('text-lg text-left font-semibold leading-none tracking-tight min-h-6', className)} {...props} />
  ),
);
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ComponentRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn('font-light text-left text-sm text-muted-foreground', className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger };
