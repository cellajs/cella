import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&:not(.absolute)]:active:translate-y-px disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent/50',
        link: 'text-primary underline-offset-4 hover:underline',
        // Add more variants here
        cell: 'text-regular underline-offset-4 hover:underline !ring-offset-transparent !ring-transparent opacity-75 hover:opacity-100',
        plain: 'text-primary bg-primary/5 border border-primary/30 hover:bg-primary/10 hover:border-primary/50',
        glow: 'outline-glow-button bg-background !rounded-full relative active:bk-background',
        gradient:
          'before:bg-primary before:rounded-md after:rounded-md z-0 bg-transparent relative text-primary-foreground gradient-button hover:before:bg-primary/80',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-4',
        icon: 'h-10 w-10',
        xl: 'h-14 rounded-lg text-lg px-6',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, children, loading, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';

    if (asChild) {
      return (
        <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled} {...props}>
          {children}
        </Comp>
      );
    }

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), loading && 'relative text-transparent')}
        ref={ref}
        disabled={loading || disabled}
        {...props}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="text-primary-foreground animate-spin" />
          </div>
        )}
        {children}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
