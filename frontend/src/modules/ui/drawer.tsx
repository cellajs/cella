import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { Drawer as DrawerPrimitive } from 'vaul';

import { cn } from '~/utils/cn';

const DrawerVariants = cva('fixed z-[150] p-4 overflow-y-auto flex flex-col rounded-t-2.5 border bg-background', {
  variants: {
    direction: {
      top: 'inset-x-0 top-0 mb-24 flex-col',
      bottom: 'inset-x-0 bottom-0 mt-24 flex-col',
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
      top: 'bottom-0.5 mx-auto my-0.5 h-1 w-12 ml-[calc(50vw-2rem)]',
      bottom: 'top-0.5 mx-auto my-0.5 h-1 w-12 ml-[calc(50vw-2rem)]',
      right: 'left-0.5 mx-0.5 my-auto h-16 w-1 mt-[calc(50vh-2.5rem)]',
      left: 'right-0.5 mx-0.5 my-auto h-16 w-1 mt-[calc(50vh-2.5rem)]',
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
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-[140] bg-background/40 backdrop-blur-sm', className)} {...props} />
));
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

export interface DrawerContentProps extends VariantProps<typeof DrawerVariants>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> {}

const DrawerContent = React.forwardRef<React.ElementRef<typeof DrawerPrimitive.Content>, DrawerContentProps>(
  ({ className, direction, children, ...props }, ref) => {
    return (
      <DrawerPortal>
        <DrawerOverlay />
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

const DrawerTitle = React.forwardRef<React.ElementRef<typeof DrawerPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DrawerPrimitive.Title ref={ref} className={cn('text-lg text-left font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn('font-light text-left text-muted-foreground', className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerOverlay, DrawerPortal, DrawerTitle, DrawerTrigger };
