import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '~/utils/utils';

const scrollbarVariants = cva('flex touch-none transition-colors z-20', {
  variants: {
    orientation: {
      vertical: 'vertical',
      horizontal: 'horizontal',
    },
    size: {
      defaultVertical: 'h-full w-2.5 border-l border-l-transparent p-[.07rem]',
      defaultHorizontal: 'h-2.5 flex-col border-t border-t-transparent p-[.07rem]',
    },
  },
  defaultVariants: {
    orientation: 'vertical',
    size: 'defaultVertical',
  },
});

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  VariantProps<typeof scrollbarVariants> & React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>
>(({ className, children, id, size, ...props }, ref) => (
  <ScrollAreaPrimitive.Root ref={ref} className={cn('relative overflow-auto', className)} {...props}>
    <ScrollAreaPrimitive.Viewport id={`${id}-viewport`} className="h-full w-full [&>div]:!block rounded-[inherit]">
      {children}
    </ScrollAreaPrimitive.Viewport>
    <ScrollBar size={size} />
    <ScrollAreaPrimitive.Corner />
  </ScrollAreaPrimitive.Root>
));
ScrollArea.displayName = ScrollAreaPrimitive.Root.displayName;

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>,
  VariantProps<typeof scrollbarVariants> & React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>
>(({ className, size = 'defaultVertical', orientation = 'vertical', ...props }, ref) => (
  <ScrollAreaPrimitive.ScrollAreaScrollbar
    ref={ref}
    orientation={orientation}
    className={cn(scrollbarVariants({ orientation, size }), className)}
    {...props}
  >
    <ScrollAreaPrimitive.ScrollAreaThumb className="bg-border relative flex-1 rounded-full" />
  </ScrollAreaPrimitive.ScrollAreaScrollbar>
));
ScrollBar.displayName = ScrollAreaPrimitive.ScrollAreaScrollbar.displayName;

export { ScrollArea, ScrollBar };
