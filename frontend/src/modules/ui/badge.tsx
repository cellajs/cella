import { type VariantProps, cva } from 'class-variance-authority';
import type * as React from 'react';

import { cn } from '~/utils/cn';

const badgeVariants = cva(
  'flex items-center justify-center border px-2 py-0.5 whitespace-nowrap font-semibold transition-colors focus:outline-hidden sm:focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 shadow-xs',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        success: 'bg-success text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        plain: 'text-primary bg-primary/5 border border-primary/10',
        outline: 'text-foreground',
      },
      size: {
        micro: 'text-[10px] h-4',
        xs: 'text-xs h-5',
        sm: 'text-xs h-6',
        md: 'text-sm h-7',
        lg: 'text-base h-10',
        xl: 'text-lg h-12',
      },
      shape: {
        default: 'rounded-full',
        rounded: 'rounded-lg',
        square: 'rounded-none',
      },
      context: {
        button: 'py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5 animate-in zoom-in',
        none: 'lowercase',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'xs',
      shape: 'default',
      context: 'none',
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, context, shape, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size, context, shape }), className)} {...props} />;
}

export { Badge, badgeVariants };
