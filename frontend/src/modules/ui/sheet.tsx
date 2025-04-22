import * as SheetPrimitive from '@radix-ui/react-dialog';
import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { type VariantProps, cva } from 'class-variance-authority';
import { X } from 'lucide-react';
import * as React from 'react';

import { cn } from '~/utils/cn';

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-113 bg-muted/30 backdrop-blur-xs',
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

// TODO Removed the animate out classes since sheeter has state issues in remove step
export const sheetVariants = cva(
  'z-114 fixed gap-4 bg-background px-4 shadow-lg transition-transform ease-in-out overflow-y-auto data-[state=open]:duration-300 data-[state=open]:animate-in data-[state=closed]:duration-200 data-[state=closed]:animate-out',
  {
    variants: {
      side: {
        top: 'inset-x-0 top-0 data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top',
        bottom: 'inset-x-0 bottom-0 data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom',
        left: 'inset-y-0 left-0 h-full w-[90%] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left',
        right: 'inset-y-0 right-0 h-full w-[90%] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
        mirrorOnMobile:
          'inset-y-0 right-0 h-full w-[90%] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:left-0 sm:data-[state=closed]:slide-out-to-left sm:data-[state=open]:slide-in-from-left',
      },
    },
    defaultVariants: {
      side: 'right',
    },
  },
);

interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>, VariantProps<typeof sheetVariants> {
  onClick?: () => void; // Adding onClick prop
  hideClose?: boolean;
  scrollableOverlay?: boolean;
}
const SheetContent = React.forwardRef<React.ComponentRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = 'right', className, children, scrollableOverlay = false, hideClose = false, onClick, ...props }, ref) => {
    const content = (
      <SheetPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
        {!hideClose && (
          <SheetPrimitive.Close
            onClick={onClick}
            className={cn(
              'sm:ring-offset-background focus-visible:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute right-4 top-3.5 rounded-sm opacity-70 transition-opacity bg-background/50 hover:opacity-100 focus:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none z-20',
              scrollableOverlay && 'fixed',
            )}
          >
            <X className="h-6 w-6" strokeWidth={1.25} />
            <span className="sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
        {children}
      </SheetPrimitive.Content>
    );

    return scrollableOverlay ? (
      <SheetOverlay onClick={onClick}>{content}</SheetOverlay>
    ) : (
      <>
        <SheetOverlay onClick={onClick} />
        {content}
      </>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2 text-left -mt-1 pb-3', className)} {...props} />
);
SheetHeader.displayName = 'SheetHeader';

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col sm:flex-row sm:space-x-2', className)} {...props} />
);
SheetFooter.displayName = 'SheetFooter';

const SheetTitle = React.forwardRef<React.ComponentRef<typeof SheetPrimitive.Title>, React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>>(
  ({ className, ...props }, ref) => <SheetPrimitive.Title ref={ref} className={cn('text-foreground text-lg font-semibold', className)} {...props} />,
);
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetHiddenTitle = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ ...props }, ref) => (
  <VisuallyHidden.Root>
    <SheetPrimitive.Title ref={ref} {...props} />
  </VisuallyHidden.Root>
));

const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn('text-muted-foreground font-light', className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetHiddenTitle,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
